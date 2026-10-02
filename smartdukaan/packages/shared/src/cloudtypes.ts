/**
 * Structured cloud-AI recognition contract (Phase 4) — types + pure validation
 * helpers shared by the backend gateway and the client. The provider is NEVER
 * trusted: these enums/ranges are the allowed surface, and the backend does the
 * authoritative validation (responseValidator.ts) plus tenant-safe candidate ID
 * checks. Nothing here lets a provider name a tenant, price, or database ID that
 * the backend hasn't already vetted.
 */

export const CLOUD_RESPONSE_VERSION = '1';

export type PackUnit = 'g' | 'kg' | 'ml' | 'l' | 'pcs' | 'pack' | 'dozen';
export const PACK_UNITS: readonly PackUnit[] = ['g', 'kg', 'ml', 'l', 'pcs', 'pack', 'dozen'];

export type ProductForm =
  | 'liquid' | 'powder' | 'solid' | 'granule' | 'paste' | 'bar' | 'spray' | 'other';
export const PRODUCT_FORMS: readonly ProductForm[] = [
  'liquid', 'powder', 'solid', 'granule', 'paste', 'bar', 'spray', 'other'];

export type SafetyFlag =
  | 'contains_person' | 'contains_document' | 'contains_payment' | 'unclear_image' | 'none';
export const SAFETY_FLAGS: readonly SafetyFlag[] = [
  'contains_person', 'contains_document', 'contains_payment', 'unclear_image', 'none'];

/** A single attribute the provider claims to have read, with its own confidence. */
export interface CloudAttribute<T> {
  value: T | null;
  confidence: number; // 0..1
  uncertain: boolean;
}

/** Provider may ONLY rank candidate IDs that the backend supplied to it. */
export interface CloudCatalogCandidate {
  candidateId: string;   // must match a backend-supplied bounded candidate id
  matches: boolean;
  confidence: number;    // 0..1
  contradictionReasons: string[];
}

export interface CloudRecognitionResult {
  responseVersion: string;
  identifiedBrand: CloudAttribute<string>;
  identifiedProductName: CloudAttribute<string>;
  identifiedVariant: CloudAttribute<string>;
  identifiedFlavor: CloudAttribute<string>;
  identifiedPackQuantity: CloudAttribute<number>;
  identifiedPackUnit: CloudAttribute<PackUnit>;
  identifiedUnitsPerPack: CloudAttribute<number>;
  identifiedProductForm: CloudAttribute<ProductForm>;
  identifiedManufacturer: CloudAttribute<string>;
  identifiedPrintedPriceMinor: CloudAttribute<number>; // integer paisa
  currency: string;
  possibleCatalogCandidates: CloudCatalogCandidate[];
  packagingChangeIndicators: string[];
  uncertaintyReasons: string[];
  safetyFlags: SafetyFlag[];
  providerConfidence: number; // 0..1 — advisory only, never authoritative
  requiresHumanConfirmation: boolean;
}

export const CLOUD_LIMITS = {
  maxStringLen: 120,
  maxCandidates: 10,
  maxReasons: 12,
  maxPriceMinor: 100_000_00, // PKR 100,000 sanity ceiling for a single retail item
  maxPackQuantity: 100_000,
  maxUnitsPerPack: 1000,
} as const;

export function isConfidence(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1;
}

export function isIntegerInRange(n: unknown, min: number, max: number): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= min && n <= max;
}

export function clampString(s: unknown, max: number = CLOUD_LIMITS.maxStringLen): string | null {
  if (typeof s !== 'string') return null;
  const t = s.trim();
  if (!t) return null;
  return t.length > max ? t.slice(0, max) : t;
}
