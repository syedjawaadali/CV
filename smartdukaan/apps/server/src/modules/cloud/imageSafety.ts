/**
 * Image validation, minimization metadata, and a heuristic safety/privacy check
 * (Phase 4). This does NOT claim perfect sensitive-content detection — it does
 * deterministic structural validation (MIME/size/dimension/decompression-bomb)
 * and passes through client-declared safety hints. Any positive safety hint
 * blocks the cloud upload; local processing continues regardless.
 *
 * Real pixel-level face/document detection would require an on-device or
 * server-side model; that is documented as a limitation, not silently faked.
 */
import { CLOUD_CONFIG } from './config.js';
import type { SafetyFlag } from '@smartdukaan/shared';

const B64 = /^[A-Za-z0-9+/]*={0,2}$/;

export interface ImageValidationInput {
  base64: string;            // no data: prefix
  mime: string;
  declaredWidth?: number | null;
  declaredHeight?: number | null;
  clientSafetyFlags?: string[]; // hints the client attached after its own crop/preview
}

export interface ImageValidationResult {
  ok: boolean;
  reason: string | null;
  byteLength: number;
  safetyFlags: SafetyFlag[];
  blocked: boolean;
}

const ALLOWED_SAFETY: SafetyFlag[] = ['contains_person', 'contains_document', 'contains_payment', 'unclear_image', 'none'];
const BLOCKING: SafetyFlag[] = ['contains_person', 'contains_document', 'contains_payment'];

export function validateAndScreenImage(input: ImageValidationInput): ImageValidationResult {
  const flags = normalizeSafetyFlags(input.clientSafetyFlags);
  const base = { safetyFlags: flags, blocked: false };

  if (!input.base64 || !B64.test(input.base64)) {
    return { ok: false, reason: 'invalid image encoding', byteLength: 0, ...base };
  }
  if (!CLOUD_CONFIG.image.allowedMime.includes(input.mime as (typeof CLOUD_CONFIG.image.allowedMime)[number])) {
    return { ok: false, reason: 'unsupported image type', byteLength: 0, ...base };
  }
  const byteLength = Math.floor((input.base64.length * 3) / 4);
  if (byteLength > CLOUD_CONFIG.image.maxBytes) {
    return { ok: false, reason: 'image too large', byteLength, ...base };
  }
  const sig = decodeSignature(input.base64);
  if (!signatureMatchesMime(sig, input.mime)) {
    return { ok: false, reason: 'image content does not match its declared type', byteLength, ...base };
  }
  const px = (input.declaredWidth ?? 0) * (input.declaredHeight ?? 0);
  if (px > CLOUD_CONFIG.image.maxPixels) {
    return { ok: false, reason: 'image dimensions too large', byteLength, ...base };
  }
  if (input.declaredWidth != null && input.declaredHeight != null && px > 0 && px < CLOUD_CONFIG.image.minPixels) {
    return { ok: false, reason: 'image too small to analyze', byteLength, ...base };
  }

  const blocked = flags.some((f) => BLOCKING.includes(f));
  return {
    ok: !blocked,
    reason: blocked ? 'image may contain a person or private information' : null,
    byteLength, safetyFlags: flags, blocked,
  };
}

function normalizeSafetyFlags(flags: string[] | undefined): SafetyFlag[] {
  if (!flags || flags.length === 0) return ['none'];
  const out = flags.filter((f): f is SafetyFlag => (ALLOWED_SAFETY as string[]).includes(f));
  return out.length ? [...new Set(out)] : ['none'];
}

function decodeSignature(base64: string): number[] {
  // Decode only the first few bytes to check the magic number.
  const prefix = base64.slice(0, 16);
  const bin = Buffer.from(prefix, 'base64');
  return Array.from(bin.subarray(0, 4));
}

function signatureMatchesMime(sig: number[], mime: string): boolean {
  if (mime === 'image/jpeg') return sig[0] === 0xff && sig[1] === 0xd8;
  if (mime === 'image/png') return sig[0] === 0x89 && sig[1] === 0x50 && sig[2] === 0x4e && sig[3] === 0x47;
  if (mime === 'image/webp') return sig[0] === 0x52 && sig[1] === 0x49 && sig[2] === 0x46 && sig[3] === 0x46; // RIFF
  return false;
}
