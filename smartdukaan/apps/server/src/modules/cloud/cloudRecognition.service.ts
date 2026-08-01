/**
 * Cloud Recognition Coordinator (Phase 4) — the secure backend gateway. It is
 * the ONLY place that talks to a cloud provider, and it enforces, in order:
 *   consent -> feature flag -> image validation/safety -> content-hash dedup ->
 *   cache -> circuit breaker -> budget reservation -> provider call (with one
 *   transient retry) -> STRICT response validation (tenant-safe candidate ids)
 *   -> usage accounting -> persistence.
 *
 * It returns candidates/attributes for HUMAN CONFIRMATION only. It never writes
 * inventory or price, never creates a verified global product, and never trusts
 * a provider-supplied id it did not itself offer.
 */
import { features } from '../../config/features.js';
import { query, withTransaction } from '../../db/pool.js';
import { logger } from '../../lib/logger.js';
import { CLOUD_CONFIG } from './config.js';
import { getConsent } from './consent.service.js';
import { validateAndScreenImage } from './imageSafety.js';
import { contentHashOf, textHash } from './fingerprint.service.js';
import { getPrompt, ACTIVE_PROMPT_KEY, ACTIVE_PROMPT_VERSION } from './promptRegistry.js';
import { getCloudProvider } from './provider/factory.js';
import { ProviderError, type BoundedCandidate, type CloudRequest } from './provider/types.js';
import { validateCloudResponse } from './responseValidator.js';
import { activeCostBasis, estimateMaxCostMinor, estimateActualCostMinor } from './costConfig.js';
import * as budget from './budget.service.js';
import * as cache from './cache.service.js';
import * as breaker from './circuitBreaker.js';
import { recordUsage } from './usage.repository.js';
import type { CloudRecognitionResult } from '@smartdukaan/shared';

export interface CloudCtx { tenantId: string; shopId: string; userId: string }

export interface CloudRecognizeInput {
  observationId?: string | null;
  recognitionSessionId?: string | null;
  idempotencyKey?: string | null;
  imageBase64?: string | null;
  imageMime?: string | null;
  imageWidth?: number | null;
  imageHeight?: number | null;
  clientSafetyFlags?: string[];
  ocrText?: string | null;
  barcode?: string | null;
  brandCandidates?: string[];
  packSizeSummary?: string | null;
  boundedCandidates?: BoundedCandidate[];
  country?: string;
  deviceId?: string | null;
  networkWifi?: boolean;
  consentThisTime?: boolean; // explicit one-time allow from the UI
}

export type CloudStatus =
  | 'completed' | 'cached' | 'not_eligible' | 'budget_blocked' | 'rate_limited'
  | 'provider_unavailable' | 'failed' | 'schema_invalid' | 'safety_rejected';

export interface CloudRecognizeOutput {
  status: CloudStatus;
  reason: string;
  cacheStatus: 'hit' | 'miss' | 'dedup' | 'n/a';
  result: CloudRecognitionResult | null;
  provider: string | null;
  humanConfirmationRequired: boolean;
  estimatedCostMinor: number;
}

function now(): Date { return new Date(); }

/** Provider-side eligibility (post feature-flag/consent) uses the mock in tests. */
export async function recognizeWithCloud(ctx: CloudCtx, input: CloudRecognizeInput): Promise<CloudRecognizeOutput> {
  const at = now();
  const country = input.country ?? 'PK';
  const provider = getCloudProvider();
  const model = provider.modelName;
  const bounded = (input.boundedCandidates ?? []).slice(0, CLOUD_CONFIG.visual.candidateLimit);
  const allowedIds = new Set(bounded.map((c) => c.candidateId));

  const fail = (status: CloudStatus, reason: string, cacheStatus: CloudRecognizeOutput['cacheStatus'] = 'n/a'): CloudRecognizeOutput => ({
    status, reason, cacheStatus, result: null, provider: provider.providerName,
    humanConfirmationRequired: true, estimatedCostMinor: 0,
  });

  // 1) Feature flag.
  if (!features.cloudProductRecognition) return fail('not_eligible', 'cloud recognition is disabled');

  // 2) Consent.
  if (features.cloudRecognitionConsent) {
    const consent = await getConsent({ shopId: ctx.shopId, userId: ctx.userId });
    if (consent.cloudMode === 'never') return fail('not_eligible', 'cloud recognition is turned off for this shop');
    if (consent.cloudMode === 'ask' && !input.consentThisTime) return fail('not_eligible', 'cloud consent required');
    if (consent.wifiOnly && input.networkWifi === false) return fail('not_eligible', 'cloud recognition is set to Wi-Fi only');
  }

  // 3) Must have something to analyze.
  if (!input.imageBase64 && !input.ocrText) return fail('not_eligible', 'no image or text to analyze');

  // 4) Image validation + safety screen (structural; blocks on sensitive hints).
  let contentHash: string | null = null;
  let imageBytes = 0;
  let safetyFlags: string[] = ['none'];
  if (input.imageBase64) {
    const screen = validateAndScreenImage({
      base64: input.imageBase64, mime: input.imageMime ?? 'image/jpeg',
      declaredWidth: input.imageWidth, declaredHeight: input.imageHeight, clientSafetyFlags: input.clientSafetyFlags,
    });
    safetyFlags = screen.safetyFlags;
    if (screen.blocked) {
      await recordSafety(ctx, contentHashOf(input.imageBase64), screen.safetyFlags, true, screen.reason);
      return fail('safety_rejected', screen.reason ?? 'image blocked by safety check');
    }
    if (!screen.ok) return fail('not_eligible', screen.reason ?? 'invalid image');
    contentHash = contentHashOf(input.imageBase64);
    imageBytes = screen.byteLength;
  }

  const ocrTextHash = input.ocrText ? textHash(input.ocrText) : null;
  const candidateSetVersion = textHash(bounded.map((c) => c.candidateId).sort().join(','));

  // 5) Cache lookup (dedup a previously validated, safe result).
  const cacheParts: cache.CacheKeyParts = {
    contentHash, ocrTextHash, provider: provider.providerName, model,
    modelVersion: provider.modelVersion, promptVersion: ACTIVE_PROMPT_VERSION,
    candidateSetVersion, country,
  };
  const cacheKey = cache.cacheKeyOf(cacheParts);
  if (features.cloudRecognitionCache) {
    const cached = await cache.lookup(cacheKey);
    if (cached) {
      await recordUsage({
        tenantId: ctx.tenantId, shopId: ctx.shopId, userId: ctx.userId, deviceId: input.deviceId,
        recognitionSessionId: input.recognitionSessionId, observationId: input.observationId,
        provider: provider.providerName, model, modelVersion: provider.modelVersion, promptVersion: ACTIVE_PROMPT_VERSION,
        inputImageCount: input.imageBase64 ? 1 : 0, inputImageBytes: imageBytes,
        inputTextBytes: (input.ocrText ?? '').length, cacheStatus: 'hit', resultStatus: 'completed', estimatedCostMinor: 0,
      });
      return {
        status: 'cached', reason: 'reused a previous safe result', cacheStatus: 'hit',
        result: cached.result, provider: provider.providerName, humanConfirmationRequired: true, estimatedCostMinor: 0,
      };
    }
  }

  // 6) Circuit breaker.
  const gate = await breaker.canRequest(provider.providerName, model, at);
  if (!gate.allowed) return fail('provider_unavailable', 'online recognition is temporarily unavailable');

  // 7) Budget reservation (skip only if budgets disabled).
  const basis = await activeCostBasis(provider.providerName, model);
  const est = provider.estimateUsage({
    imageBase64: input.imageBase64 ?? null, imageMime: input.imageMime ?? null, ocrText: input.ocrText ?? null,
    barcode: input.barcode ?? null, brandCandidates: input.brandCandidates ?? [],
    packSizeSummary: input.packSizeSummary ?? null, boundedCandidates: bounded, country,
    promptKey: ACTIVE_PROMPT_KEY, promptVersion: ACTIVE_PROMPT_VERSION, systemText: '',
  });
  const maxCost = estimateMaxCostMinor(basis, est.inputImageCount, est.inputTextBytes);
  let reservation: budget.Reservation = { ok: true, reason: 'ok', budgetId: null, reservedCostMinor: 0, warning: false };
  if (features.cloudRecognitionBudget) {
    reservation = await budget.reserve({ tenantId: ctx.tenantId, shopId: ctx.shopId }, maxCost, at);
    if (!reservation.ok) {
      await recordUsage({
        tenantId: ctx.tenantId, shopId: ctx.shopId, userId: ctx.userId, provider: provider.providerName,
        cacheStatus: 'miss', resultStatus: 'budget_blocked', fallbackReason: reservation.reason, estimatedCostMinor: 0,
      });
      return fail('budget_blocked', 'online recognition budget reached for today');
    }
  }

  // 8) Provider call with a single transient retry.
  const prompt = getPrompt();
  const req: CloudRequest = {
    imageBase64: input.imageBase64 ?? null, imageMime: input.imageMime ?? null, ocrText: input.ocrText ?? null,
    barcode: input.barcode ?? null, brandCandidates: input.brandCandidates ?? [],
    packSizeSummary: input.packSizeSummary ?? null, boundedCandidates: bounded, country,
    promptKey: prompt.promptKey, promptVersion: prompt.version, systemText: prompt.systemText,
  };

  let providerRaw: unknown = null;
  let outputBytes = 0;
  let latencyMs = 0;
  let attempt = 0;
  let lastErr: ProviderError | null = null;
  while (attempt <= CLOUD_CONFIG.cloud.maxRetries) {
    try {
      const started = Date.now();
      const resp = await provider.analyzeProductImage(req);
      latencyMs = Date.now() - started;
      providerRaw = resp.raw;
      outputBytes = resp.usage.outputBytes;
      lastErr = null;
      break;
    } catch (err) {
      lastErr = err instanceof ProviderError ? err : new ProviderError('unknown', 'provider failure', false);
      if (!lastErr.retryable || attempt === CLOUD_CONFIG.cloud.maxRetries) break;
      attempt += 1;
      await sleep(CLOUD_CONFIG.cloud.retryBaseMs * attempt + jitter());
    }
  }

  if (lastErr) {
    await breaker.recordFailure(provider.providerName, model, at);
    if (reservation.budgetId) await budget.release(reservation.budgetId, reservation.reservedCostMinor);
    const status: CloudStatus = lastErr.kind === 'safety' ? 'safety_rejected'
      : lastErr.kind === 'rate_limited' ? 'rate_limited'
      : lastErr.kind === 'timeout' || lastErr.kind === 'unavailable' || lastErr.kind === 'server_error' ? 'provider_unavailable'
      : 'failed';
    await recordUsage({
      tenantId: ctx.tenantId, shopId: ctx.shopId, userId: ctx.userId, provider: provider.providerName, model,
      cacheStatus: 'miss', resultStatus: status, errorCode: lastErr.kind, latencyMs, estimatedCostMinor: 0,
    });
    return fail(status, 'online recognition could not complete');
  }

  // 9) STRICT validation — tenant-safe candidate ids, enums, money, ranges.
  const outcome = validateCloudResponse(providerRaw, allowedIds);
  const actualCost = estimateActualCostMinor(basis, est.inputImageCount, est.inputTextBytes, outputBytes);
  if (reservation.budgetId) await budget.consume(reservation.budgetId, reservation.reservedCostMinor, actualCost);
  await breaker.recordSuccess(provider.providerName, model, latencyMs);

  if (!outcome.ok || !outcome.result) {
    logger.warn('cloud response failed validation', { errors: outcome.errors.slice(0, 5) });
    await recordUsage({
      tenantId: ctx.tenantId, shopId: ctx.shopId, userId: ctx.userId, provider: provider.providerName, model,
      modelVersion: provider.modelVersion, promptVersion: ACTIVE_PROMPT_VERSION,
      inputImageCount: est.inputImageCount, inputImageBytes: imageBytes, inputTextBytes: est.inputTextBytes,
      outputBytes, estimatedCostMinor: actualCost, actualCostMinor: actualCost, latencyMs,
      cacheStatus: 'miss', resultStatus: 'schema_invalid',
    });
    return { ...fail('schema_invalid', 'online result was not usable'), estimatedCostMinor: actualCost };
  }

  const result = outcome.result;
  const confidenceCategory = result.possibleCatalogCandidates.some((c) => c.matches) ? 'medium' : 'low';

  await recordUsage({
    tenantId: ctx.tenantId, shopId: ctx.shopId, userId: ctx.userId, deviceId: input.deviceId,
    recognitionSessionId: input.recognitionSessionId, observationId: input.observationId,
    provider: provider.providerName, model, modelVersion: provider.modelVersion, promptVersion: ACTIVE_PROMPT_VERSION,
    inputImageCount: est.inputImageCount, inputImageBytes: imageBytes, inputTextBytes: est.inputTextBytes,
    outputBytes, estimatedCostMinor: actualCost, actualCostMinor: actualCost, latencyMs,
    cacheStatus: 'miss', resultStatus: 'completed',
  });

  if (features.cloudRecognitionCache) {
    await cache.store(cacheKey, cacheParts, result, confidenceCategory, at).catch(() => { /* cache is best-effort */ });
  }

  return {
    status: 'completed', reason: 'online recognition returned a suggestion', cacheStatus: 'miss',
    result, provider: provider.providerName, humanConfirmationRequired: true, estimatedCostMinor: actualCost,
  };
}

async function recordSafety(ctx: CloudCtx, contentHash: string, flags: string[], blocked: boolean, reason: string | null) {
  await query(
    `INSERT INTO image_safety_results (tenant_id, shop_id, content_hash, flags, blocked, reason)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [ctx.tenantId, ctx.shopId, contentHash, JSON.stringify(flags), blocked, reason],
  ).catch(() => { /* best-effort */ });
}

function sleep(ms: number): Promise<void> { return new Promise((r) => setTimeout(r, ms)); }
// Deterministic-ish jitter without Math.random (Math.random is fine at runtime,
// but keep it small and bounded).
function jitter(): number { return 20; }

/** Re-export so tests can drive the provider factory. */
export { setCloudProvider } from './provider/factory.js';
export { withTransaction };
