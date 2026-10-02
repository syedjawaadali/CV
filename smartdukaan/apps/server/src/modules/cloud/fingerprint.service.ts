/**
 * Image fingerprint service (Phase 4). Computes the cryptographic content hash
 * (Node crypto — server side) and stores/looks up fingerprints. Perceptual
 * hashing math lives in @smartdukaan/shared (imagefp) and is provided by the
 * client from the captured image; this service persists and compares.
 *
 * Content hash is for exact-duplicate/dedup only; visual similarity uses the
 * perceptual hash. The two are never conflated.
 */
import { createHash } from 'node:crypto';
import {
  compareFingerprints, PHASH_CONFIG,
  type PerceptualAlgorithm, type SimilarityCategory,
} from '@smartdukaan/shared';
import { query } from '../../db/pool.js';

export function contentHashOf(base64: string): string {
  return createHash('sha256').update(Buffer.from(base64, 'base64')).digest('hex');
}

/** Hash arbitrary text (e.g. OCR text) for cache keys. */
export function textHash(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

export interface FingerprintInput {
  contentHash: string | null;
  perceptualHash: string | null;
  phashAlgorithm: PerceptualAlgorithm | null;
  phashVersion: string | null;
}

export interface VisualMatch {
  retailerProductId: string | null;
  productVariantId: string | null;
  similarityCategory: SimilarityCategory;
  distance: number;
  contentIdentical: boolean;
  ownershipScope: 'retailer' | 'global';
}

/**
 * Retrieve visual candidates for a scanned image within tenant scope + the
 * shared catalog. Bounded: exact content-hash first, then a limited perceptual
 * scan over the shop's own fingerprints and shared fingerprints (never the
 * whole catalog on-device; this runs server-side over indexed rows).
 */
export async function findVisualCandidates(
  ctx: { shopId: string }, fp: FingerprintInput, limit = PHASH_CONFIG.thresholds.weak,
): Promise<VisualMatch[]> {
  const matches: VisualMatch[] = [];

  // 1) Exact content-hash duplicates (retailer-owned or shared).
  if (fp.contentHash) {
    const dup = await query<{ retailer_product_id: string | null; product_variant_id: string | null; ownership_scope: string }>(
      `SELECT retailer_product_id, product_variant_id, ownership_scope
         FROM image_fingerprints
        WHERE content_hash = $1 AND is_active AND retention_status = 'active'
          AND (ownership_scope = 'global' OR shop_id = $2)
        LIMIT 5`,
      [fp.contentHash, ctx.shopId],
    );
    for (const r of dup.rows) {
      matches.push({
        retailerProductId: r.retailer_product_id, productVariantId: r.product_variant_id,
        similarityCategory: 'identical_file', distance: 0, contentIdentical: true,
        ownershipScope: r.ownership_scope === 'global' ? 'global' : 'retailer',
      });
    }
  }

  // 2) Perceptual near/similar scan over a bounded, compatible set.
  if (fp.perceptualHash && fp.phashAlgorithm && fp.phashVersion) {
    const res = await query<{
      retailer_product_id: string | null; product_variant_id: string | null;
      perceptual_hash: string; phash_algorithm: string; phash_version: string; ownership_scope: string;
    }>(
      `SELECT retailer_product_id, product_variant_id, perceptual_hash, phash_algorithm, phash_version, ownership_scope
         FROM image_fingerprints
        WHERE perceptual_hash IS NOT NULL AND is_active AND retention_status = 'active'
          AND phash_algorithm = $1 AND phash_version = $2
          AND (ownership_scope = 'global' OR shop_id = $3)
        ORDER BY created_at DESC
        LIMIT 300`,
      [fp.phashAlgorithm, fp.phashVersion, ctx.shopId],
    );
    const self = { hash: fp.perceptualHash, algorithm: fp.phashAlgorithm, version: fp.phashVersion };
    for (const r of res.rows) {
      const cmp = compareFingerprints(self, { hash: r.perceptual_hash, algorithm: r.phash_algorithm as PerceptualAlgorithm, version: r.phash_version });
      if (!cmp.comparable || cmp.similarityCategory === 'no_useful_similarity' || cmp.distance > limit) continue;
      // Skip if we already have a content-identical match for the same product.
      if (matches.some((m) => m.retailerProductId && m.retailerProductId === r.retailer_product_id)) continue;
      matches.push({
        retailerProductId: r.retailer_product_id, productVariantId: r.product_variant_id,
        similarityCategory: cmp.similarityCategory, distance: cmp.distance, contentIdentical: false,
        ownershipScope: r.ownership_scope === 'global' ? 'global' : 'retailer',
      });
    }
  }

  // Strongest first: content-identical, then by distance.
  matches.sort((a, b) => (Number(b.contentIdentical) - Number(a.contentIdentical)) || (a.distance - b.distance));
  return matches.slice(0, CLOUD_VISUAL_LIMIT);
}

const CLOUD_VISUAL_LIMIT = 10;

/** Persist a fingerprint for a confirmed retailer product image. */
export async function saveRetailerFingerprint(
  ctx: { tenantId: string; shopId: string }, retailerProductId: string, fp: FingerprintInput,
): Promise<string | null> {
  if (!fp.contentHash && !fp.perceptualHash) return null;
  const res = await query<{ id: string }>(
    `INSERT INTO image_fingerprints
       (tenant_id, shop_id, retailer_product_id, ownership_scope, content_hash, perceptual_hash, phash_algorithm, phash_version)
     VALUES ($1,$2,$3,'retailer',$4,$5,$6,$7) RETURNING id`,
    [ctx.tenantId, ctx.shopId, retailerProductId, fp.contentHash, fp.perceptualHash, fp.phashAlgorithm, fp.phashVersion],
  );
  return res.rows[0]?.id ?? null;
}
