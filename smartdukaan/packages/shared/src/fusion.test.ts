import { describe, it, expect } from 'vitest';
import { fuseLocalEvidence, fuseWithCloud, evidenceCompleteness } from './fusion.js';
import type { CandidateEvidence } from './scoring.js';

const ctxNone = { barcodePresent: false, ocrName: false, packSize: false, visualPresent: false };

describe('recognition fusion', () => {
  it('exact retailer barcode => exact, no cloud fallback', () => {
    const r = fuseLocalEvidence(
      [{ isRetailer: true, evidence: { barcode: 'retailer_exact' } }],
      { ...ctxNone, barcodePresent: true },
    );
    expect(r.category).toBe('exact');
    expect(r.cloudFallbackJustified).toBe(false);
    expect(r.humanConfirmationRequired).toBe(false);
  });

  it('image-only near match stays below exact and requests human confirmation', () => {
    const ev: CandidateEvidence = { perceptualNear: true };
    const r = fuseLocalEvidence([{ isRetailer: true, evidence: ev }], { ...ctxNone, visualPresent: true });
    expect(r.category).not.toBe('exact');
    expect(r.humanConfirmationRequired).toBe(true);
  });

  it('weak local evidence with an image justifies cloud fallback', () => {
    const r = fuseLocalEvidence(
      [{ isRetailer: true, evidence: { brandMatch: true } }],
      { ...ctxNone, ocrName: true, visualPresent: true },
    );
    expect(['low', 'medium']).toContain(r.category);
    expect(r.cloudFallbackJustified).toBe(true);
  });

  it('a local conflict is NEVER a cloud-fallback case', () => {
    const ev: CandidateEvidence = { barcode: 'shared_verified', packSizeContradiction: true };
    const r = fuseLocalEvidence([{ isRetailer: false, evidence: ev }], { ...ctxNone, barcodePresent: true });
    expect(r.category).toBe('conflict');
    expect(r.cloudFallbackJustified).toBe(false);
    expect(r.recommendedAction).toBe('resolve_conflict');
  });

  it('no candidate + no image => no cloud fallback', () => {
    const r = fuseLocalEvidence([], ctxNone);
    expect(r.cloudFallbackJustified).toBe(false);
    expect(r.recommendedAction).toBe('manual_or_create');
  });

  it('completeness credits an exact barcode heavily', () => {
    const c = evidenceCompleteness({ barcode: 'retailer_exact' }, { barcodePresent: true, ocrName: false, packSize: false, visualPresent: false });
    expect(c.hasExactBarcode).toBe(true);
    expect(c.score).toBeGreaterThanOrEqual(0.6);
  });
});

describe('fuseWithCloud', () => {
  const base = fuseLocalEvidence([{ isRetailer: true, evidence: { brandMatch: true } }], { ...ctxNone, ocrName: true, visualPresent: true });

  it('a local conflict overrides any provider confidence', () => {
    const local = fuseLocalEvidence(
      [{ isRetailer: false, evidence: { barcode: 'shared_verified', packSizeContradiction: true } }],
      { ...ctxNone, barcodePresent: true },
    );
    const out = fuseWithCloud(local, { hasCandidate: true, providerConfidence: 0.99, contradictsLocal: false });
    expect(out.category).toBe('conflict');
    expect(out.humanConfirmationRequired).toBe(true);
  });

  it('a confident provider suggestion never exceeds medium and always needs confirmation', () => {
    const out = fuseWithCloud(base, { hasCandidate: true, providerConfidence: 0.98, contradictsLocal: false });
    expect(out.category).toBe('medium');
    expect(out.humanConfirmationRequired).toBe(true);
  });

  it('provider contradicting local evidence flags review', () => {
    const out = fuseWithCloud(base, { hasCandidate: true, providerConfidence: 0.9, contradictsLocal: true });
    expect(out.humanConfirmationRequired).toBe(true);
  });

  it('provider with no candidate stays low', () => {
    const out = fuseWithCloud(base, { hasCandidate: false, providerConfidence: 0.1, contradictsLocal: false });
    expect(out.category).toBe('low');
  });
});
