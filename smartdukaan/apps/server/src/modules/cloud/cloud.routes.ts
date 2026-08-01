/**
 * Cloud recognition API (Phase 4). Mounted at /api/cloud behind retailer auth.
 * This is the client's ONLY path to cloud AI — the provider key never leaves the
 * backend. Every route is tenant-scoped and returns only tenant-safe data.
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { PERMISSIONS } from '@smartdukaan/shared';
import { asyncHandler, ok, parseBody } from '../../lib/http.js';
import { requirePermission } from '../../middleware/authorize.js';
import { notFound } from '../../lib/errors.js';
import { writeAudit } from '../../lib/audit.js';
import { features, type FeatureName } from '../../config/features.js';
import { rateLimit } from '../../middleware/rateLimit.js';
import { CLOUD_CONFIG } from './config.js';
import { recognizeWithCloud, type CloudRecognizeInput } from './cloudRecognition.service.js';
import { getConsent, setConsent } from './consent.service.js';
import { usageSummary } from './budget.service.js';
import { tenantUsageToday } from './usage.repository.js';
import { saveRetailerFingerprint } from './fingerprint.service.js';

export const cloudRouter = Router();

function requireFeature(name: FeatureName) {
  return (_req: Request, _res: Response, next: NextFunction) => {
    if (!features[name]) return next(notFound('This feature is not enabled'));
    next();
  };
}

function ctxOf(req: Request) {
  return { tenantId: req.auth!.tenantId, shopId: req.auth!.shopId, userId: req.auth!.userId };
}

const cloudLimiter = rateLimit([
  { limit: CLOUD_CONFIG.rateLimit.perUserPerMinute, windowMs: 60_000, scope: 'user' },
  { limit: CLOUD_CONFIG.rateLimit.perShopPerMinute, windowMs: 60_000, scope: 'shop' },
  { limit: CLOUD_CONFIG.rateLimit.perDevicePerMinute, windowMs: 60_000, scope: 'device' },
]);

/* --------------------------------------------------------------- eligibility */

cloudRouter.get(
  '/eligibility',
  requirePermission(PERMISSIONS.PRODUCT_VIEW),
  asyncHandler(async (req, res) => {
    const ctx = ctxOf(req);
    const consent = features.cloudRecognitionConsent
      ? await getConsent({ shopId: ctx.shopId, userId: ctx.userId })
      : { cloudMode: 'always' as const, wifiOnly: false, saveConfirmedImage: false };
    const usage = features.cloudRecognitionBudget ? await usageSummary(ctx, new Date()) : null;
    const available = features.cloudProductRecognition
      && consent.cloudMode !== 'never'
      && (!usage || usage.category !== 'exhausted');
    ok(res, {
      available,
      cloudEnabled: features.cloudProductRecognition,
      consentMode: consent.cloudMode,
      wifiOnly: consent.wifiOnly,
      budgetCategory: usage?.category ?? 'ok',
      // Safe category only — never raw billing internals.
      remainingCategory: usage
        ? (usage.category === 'exhausted' ? 'none' : usage.category === 'warning' ? 'low' : 'ok')
        : 'ok',
    });
  }),
);

/* ---------------------------------------------------------------- recognize */

const recognizeSchema = z.object({
  observationId: z.string().uuid().nullable().optional(),
  recognitionSessionId: z.string().max(80).nullable().optional(),
  idempotencyKey: z.string().max(120).nullable().optional(),
  imageBase64: z.string().max(8_000_000).nullable().optional(),
  imageMime: z.enum(['image/jpeg', 'image/png', 'image/webp']).nullable().optional(),
  imageWidth: z.number().int().positive().max(20000).nullable().optional(),
  imageHeight: z.number().int().positive().max(20000).nullable().optional(),
  clientSafetyFlags: z.array(z.string().max(40)).max(10).optional(),
  ocrText: z.string().max(8000).nullable().optional(),
  barcode: z.string().max(64).nullable().optional(),
  brandCandidates: z.array(z.string().max(80)).max(10).optional(),
  packSizeSummary: z.string().max(80).nullable().optional(),
  boundedCandidates: z.array(z.object({
    candidateId: z.string().max(80),
    productName: z.string().max(120),
    brand: z.string().max(80).nullable().optional(),
    variant: z.string().max(80).nullable().optional(),
    packSummary: z.string().max(80).nullable().optional(),
    manufacturer: z.string().max(120).nullable().optional(),
  })).max(10).optional(),
  country: z.string().max(4).optional(),
  deviceId: z.string().max(120).nullable().optional(),
  networkWifi: z.boolean().optional(),
  consentThisTime: z.boolean().optional(),
}).refine((v) => v.imageBase64 || v.ocrText, { message: 'image or text is required' });

cloudRouter.post(
  '/recognize',
  requireFeature('cloudProductRecognition'),
  requirePermission(PERMISSIONS.PRODUCT_VIEW),
  cloudLimiter,
  asyncHandler(async (req, res) => {
    const ctx = ctxOf(req);
    const body = parseBody(recognizeSchema, req);
    const input: CloudRecognizeInput = {
      ...body,
      boundedCandidates: (body.boundedCandidates ?? []).map((c) => ({
        candidateId: c.candidateId, productName: c.productName,
        brand: c.brand ?? null, variant: c.variant ?? null,
        packSummary: c.packSummary ?? null, manufacturer: c.manufacturer ?? null,
      })),
    };
    const out = await recognizeWithCloud(ctx, input);
    await writeAudit({
      tenantId: ctx.tenantId, shopId: ctx.shopId, actorUserId: ctx.userId,
      action: 'cloud.recognize', resourceType: 'cloud_recognition',
      metadata: { status: out.status, cacheStatus: out.cacheStatus, provider: out.provider },
    });
    // 200 always — the client uses `status` to branch; a not-eligible/blocked
    // outcome is a normal, non-error response so local fallback proceeds.
    ok(res, {
      status: out.status,
      reason: out.reason,
      cacheStatus: out.cacheStatus,
      provider: out.provider,
      humanConfirmationRequired: out.humanConfirmationRequired,
      result: out.result,
      estimatedCostCategory: out.estimatedCostMinor > 0 ? 'charged' : 'free',
    });
  }),
);

/* ------------------------------------------------------------------- usage */

cloudRouter.get(
  '/usage',
  requireFeature('aiUsageDashboard'),
  requirePermission(PERMISSIONS.PRODUCT_VIEW),
  asyncHandler(async (req, res) => {
    const ctx = ctxOf(req);
    const summary = await usageSummary(ctx, new Date());
    const dash = await tenantUsageToday(ctx.tenantId);
    ok(res, {
      period: summary.periodKey,
      category: summary.category,
      usedRequests: summary.usedRequests,
      requestLimit: summary.requestLimit,
      remainingRequests: summary.remainingRequests,
      estimatedCostMinor: summary.usedEstimatedCostMinor,
      currency: summary.currency,
      cacheHits: dash.cacheHits,
      failures: dash.failures,
      avgLatencyMs: dash.avgLatencyMs,
    });
  }),
);

/* ----------------------------------------------------------------- consent */

cloudRouter.get(
  '/consent',
  requirePermission(PERMISSIONS.PRODUCT_VIEW),
  asyncHandler(async (req, res) => {
    ok(res, await getConsent({ shopId: req.auth!.shopId, userId: req.auth!.userId }));
  }),
);

const consentSchema = z.object({
  cloudMode: z.enum(['always', 'ask', 'never']).optional(),
  wifiOnly: z.boolean().optional(),
  saveConfirmedImage: z.boolean().optional(),
});

cloudRouter.put(
  '/consent',
  requirePermission(PERMISSIONS.PRODUCT_VIEW),
  asyncHandler(async (req, res) => {
    const ctx = ctxOf(req);
    const body = parseBody(consentSchema, req);
    const next = await setConsent(ctx, body);
    await writeAudit({
      tenantId: ctx.tenantId, shopId: ctx.shopId, actorUserId: ctx.userId,
      action: 'cloud.consent.update', resourceType: 'cloud_consent', metadata: { cloudMode: next.cloudMode },
    });
    ok(res, next);
  }),
);

/* -------------------------------------------------------------- fingerprint */

const fingerprintSchema = z.object({
  retailerProductId: z.string().uuid(),
  contentHash: z.string().max(128).nullable().optional(),
  perceptualHash: z.string().max(128).nullable().optional(),
  phashAlgorithm: z.enum(['ahash', 'dhash']).nullable().optional(),
  phashVersion: z.string().max(8).nullable().optional(),
}).refine((v) => v.contentHash || v.perceptualHash, { message: 'a content or perceptual hash is required' });

cloudRouter.post(
  '/fingerprints',
  requireFeature('localImageFingerprint'),
  requirePermission(PERMISSIONS.PRODUCT_MANAGE),
  asyncHandler(async (req, res) => {
    const ctx = ctxOf(req);
    const body = parseBody(fingerprintSchema, req);
    // Tenant-scoped ownership check: the product must belong to this shop.
    const owns = await import('../../db/pool.js').then(({ query }) =>
      query<{ id: string }>(`SELECT id FROM products WHERE id = $1 AND shop_id = $2`, [body.retailerProductId, ctx.shopId]));
    if (owns.rows.length === 0) throw notFound('Product not found');
    const id = await saveRetailerFingerprint(ctx, body.retailerProductId, {
      contentHash: body.contentHash ?? null, perceptualHash: body.perceptualHash ?? null,
      phashAlgorithm: body.phashAlgorithm ?? null, phashVersion: body.phashVersion ?? null,
    });
    ok(res, { id }, 201);
  }),
);
