import { describe, it, expect } from 'vitest';
import {
  averageHash, differenceHash, hammingDistance, compareFingerprints,
  visualEvidenceOf, PHASH_CONFIG,
} from './imagefp.js';

/** Build a size*size gradient matrix, optionally perturbed. */
function gradient(size: number, cols = size, noise = 0): number[] {
  const out: number[] = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < cols; c++) {
      const base = Math.round(((r * cols + c) / (size * cols)) * 255);
      out.push(Math.max(0, Math.min(255, base + noise)));
    }
  }
  return out;
}

describe('perceptual hashing', () => {
  it('same matrix yields the same hash (deterministic)', () => {
    const g = gradient(8);
    expect(averageHash(g)).toBe(averageHash(g));
    const d = gradient(8, 9);
    expect(differenceHash(d)).toBe(differenceHash(d));
  });

  it('aHash length is 16 hex chars for an 8x8 grid (64 bits)', () => {
    expect(averageHash(gradient(8)).length).toBe(16);
  });

  it('dHash needs an extra column (size*(size+1) samples)', () => {
    expect(() => differenceHash(gradient(8, 8))).toThrow();
    expect(differenceHash(gradient(8, 9)).length).toBe(16);
  });

  it('hamming distance of identical hashes is zero', () => {
    const h = averageHash(gradient(8));
    expect(hammingDistance(h, h)).toBe(0);
  });

  it('a small brightness perturbation stays near-identical', () => {
    const a = { hash: differenceHash(gradient(8, 9, 0)), algorithm: 'dhash' as const, version: '1' };
    const b = { hash: differenceHash(gradient(8, 9, 3)), algorithm: 'dhash' as const, version: '1' };
    const cmp = compareFingerprints(a, b);
    expect(cmp.comparable).toBe(true);
    expect(cmp.distance).toBeLessThanOrEqual(PHASH_CONFIG.thresholds.nearIdentical);
    expect(cmp.similarityCategory).toBe('near_identical_image');
  });

  it('a very different image is not a useful match', () => {
    const flat = new Array(72).fill(0);
    const a = { hash: differenceHash(flat), algorithm: 'dhash' as const, version: '1' };
    const b = { hash: differenceHash(gradient(8, 9)), algorithm: 'dhash' as const, version: '1' };
    const cmp = compareFingerprints(a, b);
    // Distinct designs must not collapse into near_identical.
    expect(cmp.similarityCategory).not.toBe('near_identical_image');
  });

  it('incompatible algorithm/version is never comparable', () => {
    const a = { hash: averageHash(gradient(8)), algorithm: 'ahash' as const, version: '1' };
    const b = { hash: averageHash(gradient(8)), algorithm: 'dhash' as const, version: '1' };
    const cmp = compareFingerprints(a, b);
    expect(cmp.comparable).toBe(false);
    expect(cmp.similarityCategory).toBe('no_useful_similarity');
    expect(cmp.warnings.length).toBeGreaterThan(0);
  });

  it('maps similarity categories to visual-evidence buckets', () => {
    expect(visualEvidenceOf('identical_file')).toBe('content_identical');
    expect(visualEvidenceOf('near_identical_image')).toBe('perceptual_near');
    expect(visualEvidenceOf('visually_similar')).toBe('perceptual_similar');
    expect(visualEvidenceOf('weak_similarity')).toBe('none');
    expect(visualEvidenceOf('no_useful_similarity')).toBe('none');
  });
});
