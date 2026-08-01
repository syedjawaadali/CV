/**
 * Local image fingerprinting (Phase 4) — pure, deterministic, dependency-free.
 *
 * This module holds the *visually meaningful, testable* core of image
 * matching: perceptual hashing over a normalized grayscale matrix and hash
 * comparison. It deliberately does NOT decode images or compute cryptographic
 * content hashes — those are environment-specific (Node `crypto` on the server,
 * `SubtleCrypto` on the web) and live in the respective fingerprint services.
 *
 * The perceptual hash is used ONLY as one recognition signal. Visual similarity
 * never decides product identity on its own (see fusion.ts / scoring.ts).
 *
 * Thresholds are INITIAL VALIDATION HYPOTHESES and must be validated on real
 * Pakistani packaging photographs before being treated as tuned.
 */

export type PerceptualAlgorithm = 'ahash' | 'dhash';

export interface PhashConfig {
  /** Grid size; the hash has size*size bits (aHash) or size*size bits (dHash uses size x (size+1) samples). */
  size: number;
  algorithm: PerceptualAlgorithm;
  version: string;
  /** Hamming-distance thresholds over the bit string (inclusive upper bounds). */
  thresholds: {
    nearIdentical: number; // <= => near-identical package image
    similar: number;       // <= => visually similar
    weak: number;          // <= => weak similarity; above => no useful similarity
  };
}

export const PHASH_CONFIG: PhashConfig = {
  size: 8,
  algorithm: 'dhash',
  version: '1',
  // For a 64-bit hash: small distances mean strong visual similarity.
  thresholds: { nearIdentical: 6, similar: 12, weak: 20 },
};

export type SimilarityCategory =
  | 'identical_file'        // content hashes equal (decided by the service, not here)
  | 'near_identical_image'  // perceptual distance <= nearIdentical
  | 'visually_similar'      // <= similar
  | 'weak_similarity'       // <= weak
  | 'no_useful_similarity'; // > weak

export interface FingerprintComparison {
  distance: number;
  maxDistance: number;
  normalizedSimilarity: number; // 1 - distance/maxDistance, clamped to [0,1]
  similarityCategory: SimilarityCategory;
  comparable: boolean;          // false if algorithms/versions/lengths differ
  warnings: string[];
}

/**
 * Average hash: 1 bit per cell, set when the cell's grey value is >= the mean.
 * `gray` is a row-major grayscale matrix of length size*size, values 0..255.
 */
export function averageHash(gray: number[], size = PHASH_CONFIG.size): string {
  const n = size * size;
  if (gray.length !== n) throw new Error(`averageHash expects ${n} values, got ${gray.length}`);
  let sum = 0;
  for (let i = 0; i < n; i++) sum += gray[i] ?? 0;
  const mean = sum / n;
  const bits: number[] = [];
  for (let i = 0; i < n; i++) bits.push((gray[i] ?? 0) >= mean ? 1 : 0);
  return bitsToHex(bits);
}

/**
 * Difference hash: 1 bit per horizontal adjacency, set when left >= right.
 * `gray` is a row-major grayscale matrix of length size*(size+1) — i.e. one
 * extra column so each row yields `size` comparisons (size*size bits total).
 */
export function differenceHash(gray: number[], size = PHASH_CONFIG.size): string {
  const cols = size + 1;
  const n = size * cols;
  if (gray.length !== n) throw new Error(`differenceHash expects ${n} values, got ${gray.length}`);
  const bits: number[] = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const left = gray[r * cols + c] ?? 0;
      const right = gray[r * cols + c + 1] ?? 0;
      bits.push(left >= right ? 1 : 0);
    }
  }
  return bitsToHex(bits);
}

/** Hamming distance between two equal-length hex hash strings. */
export function hammingDistance(a: string, b: string): number {
  if (a.length !== b.length) throw new Error('hammingDistance: hashes differ in length');
  let dist = 0;
  for (let i = 0; i < a.length; i++) {
    const x = parseInt(a[i]!, 16) ^ parseInt(b[i]!, 16);
    dist += NIBBLE_BITS[x & 0xf]!;
  }
  return dist;
}

export interface PerceptualHashInput {
  hash: string;
  algorithm: PerceptualAlgorithm;
  version: string;
}

/**
 * Compare two perceptual hashes. Returns `comparable: false` (and
 * `no_useful_similarity`) when algorithm/version/length differ — incompatible
 * fingerprints must NEVER be treated as a match.
 */
export function compareFingerprints(
  a: PerceptualHashInput, b: PerceptualHashInput, cfg: PhashConfig = PHASH_CONFIG,
): FingerprintComparison {
  const warnings: string[] = [];
  const maxDistance = a.hash.length * 4; // 4 bits per hex char
  if (a.algorithm !== b.algorithm || a.version !== b.version || a.hash.length !== b.hash.length) {
    warnings.push('incompatible perceptual-hash algorithm/version');
    return {
      distance: maxDistance, maxDistance, normalizedSimilarity: 0,
      similarityCategory: 'no_useful_similarity', comparable: false, warnings,
    };
  }
  const distance = hammingDistance(a.hash, b.hash);
  const normalizedSimilarity = maxDistance > 0 ? Math.max(0, 1 - distance / maxDistance) : 0;
  let similarityCategory: SimilarityCategory;
  if (distance <= cfg.thresholds.nearIdentical) similarityCategory = 'near_identical_image';
  else if (distance <= cfg.thresholds.similar) similarityCategory = 'visually_similar';
  else if (distance <= cfg.thresholds.weak) similarityCategory = 'weak_similarity';
  else similarityCategory = 'no_useful_similarity';
  return { distance, maxDistance, normalizedSimilarity, similarityCategory, comparable: true, warnings };
}

/** Map a similarity category to the visual-evidence bucket used by scoring. */
export function visualEvidenceOf(
  category: SimilarityCategory,
): 'content_identical' | 'perceptual_near' | 'perceptual_similar' | 'none' {
  switch (category) {
    case 'identical_file': return 'content_identical';
    case 'near_identical_image': return 'perceptual_near';
    case 'visually_similar': return 'perceptual_similar';
    default: return 'none';
  }
}

// --- helpers -----------------------------------------------------------------

const NIBBLE_BITS = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4];

function bitsToHex(bits: number[]): string {
  // Pad to a multiple of 4 so the hex representation is lossless.
  const padded = bits.slice();
  while (padded.length % 4 !== 0) padded.push(0);
  let hex = '';
  for (let i = 0; i < padded.length; i += 4) {
    const nibble = (padded[i]! << 3) | (padded[i + 1]! << 2) | (padded[i + 2]! << 1) | padded[i + 3]!;
    hex += nibble.toString(16);
  }
  return hex;
}
