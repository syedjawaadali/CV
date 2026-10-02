/**
 * Cloud response validator (Phase 4) — the trust boundary. Provider output is
 * NEVER used directly. This module:
 *   - enforces a strict schema (types, enums, string lengths, money, ranges),
 *   - rejects malformed responses,
 *   - validates every candidateId against the backend-supplied allowed set
 *     (tenant-safe — a provider can never surface an id we didn't offer),
 *   - strips anything the provider must not control (tenant, price, ids, etc.).
 *
 * Note: money is validated as integer minor units (paisa). No floats.
 */
import {
  CLOUD_LIMITS, CLOUD_RESPONSE_VERSION, PACK_UNITS, PRODUCT_FORMS, SAFETY_FLAGS,
  clampString, isConfidence, isIntegerInRange,
  type CloudRecognitionResult, type PackUnit, type ProductForm, type SafetyFlag,
} from '@smartdukaan/shared';

export interface ValidationOutcome {
  ok: boolean;
  errors: string[];
  result: CloudRecognitionResult | null;
}

function attr<T>(raw: unknown, coerce: (v: unknown) => T | null): { value: T | null; confidence: number; uncertain: boolean } {
  const o = (raw ?? {}) as Record<string, unknown>;
  const value = coerce(o.value);
  const confidence = isConfidence(o.confidence) ? (o.confidence as number) : 0;
  const uncertain = value == null || o.uncertain === true;
  return { value, confidence, uncertain };
}

const str = (v: unknown) => clampString(v);
const enumOf = <T extends string>(allowed: readonly T[]) => (v: unknown): T | null =>
  (typeof v === 'string' && (allowed as readonly string[]).includes(v)) ? (v as T) : null;
const intIn = (min: number, max: number) => (v: unknown): number | null =>
  isIntegerInRange(v, min, max) ? (v as number) : null;

/**
 * Validate + sanitize a raw provider result against the allowed candidate ids.
 */
export function validateCloudResponse(raw: unknown, allowedCandidateIds: Set<string>): ValidationOutcome {
  const errors: string[] = [];
  if (raw == null || typeof raw !== 'object') {
    return { ok: false, errors: ['response is not an object'], result: null };
  }
  const o = raw as Record<string, unknown>;

  if (o.responseVersion !== CLOUD_RESPONSE_VERSION) {
    errors.push(`unsupported responseVersion: ${String(o.responseVersion)}`);
  }
  if (!isConfidence(o.providerConfidence)) {
    errors.push('providerConfidence out of range');
  }

  // Candidate ids: keep ONLY those the backend actually supplied. An unknown id
  // is a hard validation failure (possible manipulation), not silently dropped.
  const rawCands = Array.isArray(o.possibleCatalogCandidates) ? o.possibleCatalogCandidates : [];
  if (rawCands.length > CLOUD_LIMITS.maxCandidates) errors.push('too many candidates');
  const candidates = [];
  for (const c of rawCands.slice(0, CLOUD_LIMITS.maxCandidates)) {
    const co = (c ?? {}) as Record<string, unknown>;
    const id = typeof co.candidateId === 'string' ? co.candidateId : '';
    if (!allowedCandidateIds.has(id)) {
      errors.push(`candidateId not in allowed set: ${id.slice(0, 40)}`);
      continue;
    }
    candidates.push({
      candidateId: id,
      matches: co.matches === true,
      confidence: isConfidence(co.confidence) ? (co.confidence as number) : 0,
      contradictionReasons: sanitizeStringArray(co.contradictionReasons),
    });
  }

  // A malformed response (bad version/confidence/unknown id) is rejected.
  if (errors.length > 0) return { ok: false, errors, result: null };

  const priceMinor = attr<number>(o.identifiedPrintedPriceMinor, intIn(0, CLOUD_LIMITS.maxPriceMinor));

  const result: CloudRecognitionResult = {
    responseVersion: CLOUD_RESPONSE_VERSION,
    identifiedBrand: attr<string>(o.identifiedBrand, str),
    identifiedProductName: attr<string>(o.identifiedProductName, str),
    identifiedVariant: attr<string>(o.identifiedVariant, str),
    identifiedFlavor: attr<string>(o.identifiedFlavor, str),
    identifiedPackQuantity: attr<number>(o.identifiedPackQuantity, intIn(0, CLOUD_LIMITS.maxPackQuantity)),
    identifiedPackUnit: attr<PackUnit>(o.identifiedPackUnit, enumOf(PACK_UNITS)),
    identifiedUnitsPerPack: attr<number>(o.identifiedUnitsPerPack, intIn(0, CLOUD_LIMITS.maxUnitsPerPack)),
    identifiedProductForm: attr<ProductForm>(o.identifiedProductForm, enumOf(PRODUCT_FORMS)),
    identifiedManufacturer: attr<string>(o.identifiedManufacturer, str),
    identifiedPrintedPriceMinor: priceMinor,
    currency: clampString(o.currency, 8) ?? 'PKR',
    possibleCatalogCandidates: candidates,
    packagingChangeIndicators: sanitizeStringArray(o.packagingChangeIndicators),
    uncertaintyReasons: sanitizeStringArray(o.uncertaintyReasons),
    safetyFlags: sanitizeEnumArray<SafetyFlag>(o.safetyFlags, SAFETY_FLAGS, 'none'),
    providerConfidence: o.providerConfidence as number,
    // The backend ALWAYS requires confirmation regardless of what the provider says.
    requiresHumanConfirmation: true,
  };
  return { ok: true, errors: [], result };
}

function sanitizeStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.slice(0, CLOUD_LIMITS.maxReasons)
    .map((x) => clampString(x))
    .filter((x): x is string => x != null);
}

function sanitizeEnumArray<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T[] {
  if (!Array.isArray(v)) return [fallback];
  const out = v.filter((x): x is T => typeof x === 'string' && (allowed as readonly string[]).includes(x));
  return out.length ? [...new Set(out)] : [fallback];
}
