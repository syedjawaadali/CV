import { describe, it, expect } from 'vitest';
import { CLOUD_RESPONSE_VERSION } from '@smartdukaan/shared';
import { validateCloudResponse } from '../modules/cloud/responseValidator.js';

function base(overrides: Record<string, unknown> = {}) {
  return {
    responseVersion: CLOUD_RESPONSE_VERSION,
    providerConfidence: 0.8,
    possibleCatalogCandidates: [],
    ...overrides,
  };
}

describe('validateCloudResponse — trust boundary', () => {
  it('rejects a candidateId that was not in the allowed set (anti-manipulation)', () => {
    const raw = base({
      possibleCatalogCandidates: [{ candidateId: 'evil-id', matches: true, confidence: 0.9, contradictionReasons: [] }],
    });
    const out = validateCloudResponse(raw, new Set(['known-id']));
    expect(out.ok).toBe(false);
    expect(out.result).toBeNull();
    expect(out.errors.some((e) => e.includes('not in allowed set'))).toBe(true);
  });

  it('accepts only allowed candidate ids', () => {
    const raw = base({
      possibleCatalogCandidates: [{ candidateId: 'known-id', matches: true, confidence: 0.9, contradictionReasons: [] }],
    });
    const out = validateCloudResponse(raw, new Set(['known-id']));
    expect(out.ok).toBe(true);
    expect(out.result?.possibleCatalogCandidates[0]?.candidateId).toBe('known-id');
  });

  it('rejects an unsupported response version', () => {
    const out = validateCloudResponse(base({ responseVersion: '999' }), new Set());
    expect(out.ok).toBe(false);
  });

  it('rejects out-of-range provider confidence', () => {
    const out = validateCloudResponse(base({ providerConfidence: 5 }), new Set());
    expect(out.ok).toBe(false);
  });

  it('clamps an over-long string and drops an out-of-range price', () => {
    const out = validateCloudResponse(base({
      identifiedBrand: { value: 'x'.repeat(500), confidence: 0.5, uncertain: false },
      identifiedPrintedPriceMinor: { value: 999_999_999, confidence: 0.9, uncertain: false },
    }), new Set());
    expect(out.ok).toBe(true);
    expect((out.result!.identifiedBrand.value ?? '').length).toBeLessThanOrEqual(120);
    expect(out.result!.identifiedPrintedPriceMinor.value).toBeNull(); // exceeded max, coerced to null
  });

  it('rejects an invalid pack unit enum but keeps the rest', () => {
    const out = validateCloudResponse(base({
      identifiedPackUnit: { value: 'furlong', confidence: 0.9, uncertain: false },
    }), new Set());
    expect(out.ok).toBe(true);
    expect(out.result!.identifiedPackUnit.value).toBeNull();
  });

  it('always forces requiresHumanConfirmation regardless of provider claim', () => {
    const out = validateCloudResponse(base({ requiresHumanConfirmation: false }), new Set());
    expect(out.result!.requiresHumanConfirmation).toBe(true);
  });

  it('rejects a non-object response', () => {
    expect(validateCloudResponse(null, new Set()).ok).toBe(false);
    expect(validateCloudResponse('nope', new Set()).ok).toBe(false);
  });
});
