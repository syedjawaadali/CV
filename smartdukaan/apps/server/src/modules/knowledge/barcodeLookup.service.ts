import { analyzeBarcode } from '@smartdukaan/shared';
import { query } from '../../db/pool.js';

/**
 * Structured barcode lookup — the Phase 2 core the future OCR / image / cloud
 * pipeline will plug into. It NEVER calls OCR or cloud AI. Order:
 *   1. normalize + classify the scanned value
 *   2. retailer barcode mapping (this shop)         -> retailer_exact_match
 *   3. retailer product.barcode (this shop)          -> retailer_exact_match
 *   4. shared catalog barcodes (global scope)        -> shared_exact_match / multiple_candidates
 *   5. classify not-found (internal_code / invalid / not_found)
 * Every lookup records a recognition_observation for learning/audit.
 */

interface Ctx { tenantId: string; shopId: string; userId: string }

export type LookupStatus =
  | 'retailer_exact_match'
  | 'shared_exact_match'
  | 'multiple_candidates'
  | 'conflict'
  | 'not_found'
  | 'invalid'
  | 'internal_code';

export interface BarcodeLookupResult {
  lookupStatus: LookupStatus;
  normalizedBarcode: string;
  classification: string;
  retailerProduct: Record<string, unknown> | null;
  sharedProduct: Record<string, unknown> | null;
  candidates: Array<Record<string, unknown>>;
  conflict: boolean;
  observationId: string | null;
  recommendedNextAction: string;
}

const RETAILER_PRODUCT_COLS = `
  id, name, name_ur AS "nameUr", barcode, category, unit,
  selling_price_minor AS "sellingPriceMinor", stock_qty::text AS "stockQty",
  catalog_match_status AS "catalogMatchStatus"`;

const VARIANT_COLS = `
  v.id AS "variantId", v.variant_name AS "variantName", v.pack_quantity AS "packQuantity",
  v.pack_unit AS "packUnit", v.product_form AS "productForm",
  g.id AS "globalProductId", g.canonical_name AS "name", g.brand, g.category,
  g.verification_status AS "verificationStatus"`;

export async function lookupBarcode(ctx: Ctx, rawBarcode: string): Promise<BarcodeLookupResult> {
  const info = analyzeBarcode(rawBarcode);
  const normalized = info.normalized;

  const base: BarcodeLookupResult = {
    lookupStatus: 'not_found', normalizedBarcode: normalized, classification: info.classification,
    retailerProduct: null, sharedProduct: null, candidates: [], conflict: false,
    observationId: null, recommendedNextAction: 'create_retailer_product',
  };

  if (!normalized) {
    base.lookupStatus = 'invalid';
    base.recommendedNextAction = 'rescan';
    return base;
  }

  // Record the observation first (append-only; barcodes are untrusted input).
  const obs = await query<{ id: string }>(
    `INSERT INTO recognition_observations
       (tenant_id, shop_id, user_id, observation_type, raw_value, normalized_value, barcode_value, status)
     VALUES ($1,$2,$3,'barcode',$4,$5,$5,'open') RETURNING id`,
    [ctx.tenantId, ctx.shopId, ctx.userId, rawBarcode, normalized],
  );
  const observationId = obs.rows[0]!.id;
  base.observationId = observationId;

  // 2 + 3: retailer match (barcode mapping OR the product's own barcode column).
  const retailer = await query(
    `SELECT ${RETAILER_PRODUCT_COLS} FROM products p
      WHERE p.shop_id = $1 AND p.active AND (
        regexp_replace(COALESCE(p.barcode,''), '\\s', '', 'g') = $2
        OR EXISTS (
          SELECT 1 FROM product_barcodes b
           WHERE b.retailer_product_id = p.id AND b.ownership_scope = 'retailer'
             AND b.is_active AND b.barcode_normalized = $2))
      LIMIT 2`,
    [ctx.shopId, normalized],
  );
  if (retailer.rows.length > 0) {
    base.retailerProduct = retailer.rows[0] as Record<string, unknown>;
    base.lookupStatus = 'retailer_exact_match';
    base.recommendedNextAction = 'use_existing_product';
    await resolveObservation(observationId, retailer.rows.length, 'resolved');
    return base;
  }

  // 4: shared catalog barcodes (global scope) -> distinct variants.
  const shared = await query(
    `SELECT DISTINCT ${VARIANT_COLS}
       FROM product_barcodes b
       JOIN product_variants v ON v.id = b.product_variant_id
       JOIN global_products g ON g.id = v.global_product_id
      WHERE b.ownership_scope = 'global' AND b.is_active AND b.barcode_normalized = $1
      LIMIT 10`,
    [normalized],
  );
  if (shared.rows.length === 1) {
    base.sharedProduct = shared.rows[0] as Record<string, unknown>;
    base.lookupStatus = 'shared_exact_match';
    base.recommendedNextAction = 'add_shared_product_to_shop';
    await resolveObservation(observationId, 1, 'resolved');
    return base;
  }
  if (shared.rows.length > 1) {
    base.candidates = shared.rows as Array<Record<string, unknown>>;
    base.conflict = true;
    base.lookupStatus = 'multiple_candidates';
    base.recommendedNextAction = 'choose_candidate';
    await resolveObservation(observationId, shared.rows.length, 'resolved');
    return base;
  }

  // 5: not found — classify why. An invalid check digit does NOT block anything.
  if (info.classification === 'internal_code') {
    base.lookupStatus = 'internal_code';
    base.recommendedNextAction = 'create_retailer_product';
  } else {
    base.lookupStatus = 'not_found';
    base.recommendedNextAction = 'create_retailer_product';
  }
  await resolveObservation(observationId, 0, 'unmatched');
  return base;
}

async function resolveObservation(id: string, candidateCount: number, status: string): Promise<void> {
  await query(
    `UPDATE recognition_observations
        SET candidate_count = $2, status = $3, resolved_at = now()
      WHERE id = $1`,
    [id, candidateCount, status],
  );
}
