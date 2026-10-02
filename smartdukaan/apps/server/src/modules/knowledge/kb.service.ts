import { toMinor, normalizeText, normalizeBarcode } from '@smartdukaan/shared';
import { query, withTransaction } from '../../db/pool.js';
import { notFound, businessRule } from '../../lib/errors.js';

interface Ctx { tenantId: string; shopId: string; userId: string }

/* ------------------------------------------------------ shared catalog search */

/** Search the SHARED catalog (global products + aliases). Returns no private
 *  retailer data. Exact-normalized alias match + name prefix/contains. */
export async function searchCatalog(q: string, limit = 20) {
  const norm = normalizeText(q);
  if (!norm) return { data: [] };
  const { rows } = await query(
    `SELECT DISTINCT g.id AS "globalProductId", g.canonical_name AS "name",
            g.urdu_name AS "urduName", g.brand, g.category,
            g.verification_status AS "verificationStatus"
       FROM global_products g
       LEFT JOIN product_aliases a
         ON a.global_product_id = g.id AND a.ownership_scope = 'global' AND a.is_active
      WHERE g.is_active AND g.catalog_status = 'active' AND (
            g.canonical_name_normalized LIKE '%' || $1 || '%'
         OR a.normalized_alias = $1)
      ORDER BY g.canonical_name ASC
      LIMIT $2`,
    [norm, Math.min(limit, 50)],
  );
  return { data: rows };
}

/** Full detail for a shared variant: variant + packaging versions + global
 *  barcodes + global aliases. Shared data only. */
export async function getVariantDetail(variantId: string) {
  const v = await query(
    `SELECT v.id, v.variant_name AS "variantName", v.flavor, v.color_descriptor AS "color",
            v.pack_quantity AS "packQuantity", v.pack_unit AS "packUnit",
            v.base_quantity AS "baseQuantity", v.base_unit AS "baseUnit",
            v.units_per_pack AS "unitsPerPack", v.product_form AS "productForm",
            g.id AS "globalProductId", g.canonical_name AS "name", g.brand, g.category,
            g.manufacturer, g.verification_status AS "verificationStatus"
       FROM product_variants v JOIN global_products g ON g.id = v.global_product_id
      WHERE v.id = $1`,
    [variantId],
  );
  if (!v.rows[0]) throw notFound('Product not found in the shared catalog');
  const [packaging, barcodes, aliases] = await Promise.all([
    query(`SELECT id, packaging_version_label AS "label", primary_color_description AS "color",
                  printed_price_text AS "printedPrice", is_current AS "isCurrent",
                  is_promotional AS "isPromotional", valid_from AS "validFrom", valid_until AS "validUntil"
             FROM packaging_versions WHERE product_variant_id = $1 ORDER BY is_current DESC, created_at DESC`, [variantId]),
    query(`SELECT barcode_value AS "barcode", barcode_format AS "format", classification, verification_status AS "verificationStatus"
             FROM product_barcodes WHERE product_variant_id = $1 AND ownership_scope = 'global' AND is_active`, [variantId]),
    query(`SELECT alias_text AS "alias", language_code AS "language", alias_type AS "type"
             FROM product_aliases WHERE product_variant_id = $1 AND ownership_scope = 'global' AND is_active`, [variantId]),
  ]);
  return {
    ...(v.rows[0] as object),
    packagingVersions: packaging.rows,
    barcodes: barcodes.rows,
    aliases: aliases.rows,
  };
}

/* ------------------------------------------------ retailer product ↔ catalog */

/** Link a retailer product to a shared variant (retailer-owned action). Records
 *  a recognition confirmation. Never mutates the shared catalog. */
export async function linkProduct(
  ctx: Ctx, productId: string, input: { variantId: string; globalProductId?: string | null; observationId?: string | null },
) {
  return withTransaction(async (tx) => {
    const prod = await tx.query(`SELECT id FROM products WHERE id = $1 AND shop_id = $2 FOR UPDATE`, [productId, ctx.shopId]);
    if (!prod.rows[0]) throw notFound('Product not found');
    const variant = await tx.query(
      `SELECT v.id, v.global_product_id FROM product_variants v WHERE v.id = $1 AND v.is_active`, [input.variantId]);
    if (!variant.rows[0]) throw notFound('Shared product variant not found');
    const globalId = input.globalProductId ?? (variant.rows[0] as { global_product_id: string }).global_product_id;

    const updated = await tx.query(
      `UPDATE products SET
         product_variant_id = $1, global_product_id = $2,
         catalog_match_status = 'confirmed', catalog_match_source = 'retailer_confirmation',
         last_catalog_confirmation_at = now(), updated_at = now()
       WHERE id = $3 AND shop_id = $4
       RETURNING id, catalog_match_status AS "catalogMatchStatus"`,
      [input.variantId, globalId, productId, ctx.shopId],
    );
    await tx.query(
      `INSERT INTO recognition_confirmations
         (observation_id, tenant_id, shop_id, user_id, confirmed_global_product_id,
          confirmed_variant_id, confirmed_retailer_product_id, confirmation_action)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'selected_different')`,
      [input.observationId ?? null, ctx.tenantId, ctx.shopId, ctx.userId, globalId, input.variantId, productId],
    );
    return updated.rows[0];
  });
}

/** Unlink an incorrect catalog match — back to retailer-only/unmatched. */
export async function unlinkProduct(ctx: Ctx, productId: string) {
  const { rows } = await query(
    `UPDATE products SET
       product_variant_id = NULL, global_product_id = NULL, preferred_packaging_version_id = NULL,
       catalog_match_status = 'unmatched', catalog_match_source = NULL, updated_at = now()
     WHERE id = $1 AND shop_id = $2
     RETURNING id, catalog_match_status AS "catalogMatchStatus"`,
    [productId, ctx.shopId],
  );
  if (!rows[0]) throw notFound('Product not found');
  return rows[0];
}

/* ---------------------------------------------------------- price observations */

/** Append a price observation. Never overwrites the retailer's selling price
 *  (that stays retailer-controlled via the product edit screen). Marks the
 *  prior current observation of the same type as no-longer-current. */
export async function recordPriceObservation(
  ctx: Ctx,
  input: { productId: string; priceType: string; amount: number; currency?: string; observationSource?: string },
) {
  return withTransaction(async (tx) => {
    const prod = await tx.query(`SELECT id FROM products WHERE id = $1 AND shop_id = $2`, [input.productId, ctx.shopId]);
    if (!prod.rows[0]) throw notFound('Product not found');
    await tx.query(
      `UPDATE price_observations SET is_current = FALSE
        WHERE retailer_product_id = $1 AND price_type = $2 AND is_current`,
      [input.productId, input.priceType],
    );
    const { rows } = await tx.query(
      `INSERT INTO price_observations
         (retailer_product_id, tenant_id, shop_id, price_type, amount_minor, currency, observation_source, is_current)
       VALUES ($1,$2,$3,$4,$5,$6,$7,TRUE)
       RETURNING id, price_type AS "priceType", amount_minor AS "amountMinor", currency, observed_at AS "observedAt"`,
      [input.productId, ctx.tenantId, ctx.shopId, input.priceType,
        toMinor(input.amount), input.currency ?? 'PKR', input.observationSource ?? 'manual'],
    );
    return rows[0];
  });
}

export async function getPriceHistory(ctx: Ctx, productId: string) {
  const prod = await query(`SELECT id FROM products WHERE id = $1 AND shop_id = $2`, [productId, ctx.shopId]);
  if (!prod.rows[0]) throw notFound('Product not found');
  const { rows } = await query(
    `SELECT id, price_type AS "priceType", amount_minor AS "amountMinor", currency,
            observation_source AS "source", observed_at AS "observedAt", is_current AS "isCurrent"
       FROM price_observations
      WHERE retailer_product_id = $1 AND tenant_id = $2
      ORDER BY observed_at DESC LIMIT 100`,
    [productId, ctx.tenantId],
  );
  return { data: rows };
}

/* -------------------------------------------------------------- recent products */

export async function recentProducts(ctx: Ctx, type: 'created' | 'updated' | 'scanned', limit = 20) {
  const lim = Math.min(limit, 50);
  if (type === 'scanned') {
    const { rows } = await query(
      `SELECT o.id AS "observationId", o.barcode_value AS "barcode", o.status, o.created_at AS "scannedAt"
         FROM recognition_observations o
        WHERE o.shop_id = $1 AND o.observation_type = 'barcode'
        ORDER BY o.created_at DESC LIMIT $2`,
      [ctx.shopId, lim],
    );
    return { data: rows };
  }
  const col = type === 'updated' ? 'updated_at' : 'created_at';
  const { rows } = await query(
    `SELECT id, name, name_ur AS "nameUr", barcode, category, unit,
            selling_price_minor AS "sellingPriceMinor", catalog_match_status AS "catalogMatchStatus",
            ${col} AS "at"
       FROM products WHERE shop_id = $1 AND active
      ORDER BY ${col} DESC LIMIT $2`,
    [ctx.shopId, lim],
  );
  return { data: rows };
}

/* ---------------------------------------------------- observations & confirms */

export async function createObservation(
  ctx: Ctx,
  input: { observationType: string; rawValue?: string; barcodeValue?: string },
) {
  const { rows } = await query(
    `INSERT INTO recognition_observations
       (tenant_id, shop_id, user_id, observation_type, raw_value, normalized_value, barcode_value)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, status`,
    [ctx.tenantId, ctx.shopId, ctx.userId, input.observationType, input.rawValue ?? null,
      input.rawValue ? normalizeText(input.rawValue) : null, input.barcodeValue ? normalizeBarcode(input.barcodeValue) : null],
  );
  return rows[0];
}

export async function confirmObservation(
  ctx: Ctx, observationId: string,
  input: { action: string; variantId?: string | null; globalProductId?: string | null; retailerProductId?: string | null; correctionReason?: string | null },
) {
  const obs = await query(`SELECT id FROM recognition_observations WHERE id = $1 AND shop_id = $2`, [observationId, ctx.shopId]);
  if (!obs.rows[0]) throw notFound('Observation not found');
  const { rows } = await query(
    `INSERT INTO recognition_confirmations
       (observation_id, tenant_id, shop_id, user_id, confirmed_variant_id, confirmed_global_product_id,
        confirmed_retailer_product_id, confirmation_action, correction_reason)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id, confirmation_action AS "action"`,
    [observationId, ctx.tenantId, ctx.shopId, ctx.userId, input.variantId ?? null, input.globalProductId ?? null,
      input.retailerProductId ?? null, input.action, input.correctionReason ?? null],
  );
  await query(`UPDATE recognition_observations SET status = 'resolved', resolved_at = now() WHERE id = $1`, [observationId]);
  return rows[0];
}

/* ------------------------------------------------ catalog suggestions (review) */

/** Create a catalog-review candidate. NEVER publishes to the shared catalog —
 *  it only queues a proposal for later governance/review. */
export async function createReviewCandidate(
  ctx: Ctx,
  input: {
    candidateType: string; proposedAction?: string; proposedBarcode?: string; proposedAlias?: string;
    proposedGlobalProductId?: string | null; proposedVariantId?: string | null;
    proposedData?: unknown; sourceObservationId?: string | null;
  },
) {
  const allowed = ['new_product', 'alias', 'barcode', 'correction', 'packaging_version', 'merge'];
  if (!allowed.includes(input.candidateType)) throw businessRule('Unknown suggestion type');
  const { rows } = await query(
    `INSERT INTO catalog_review_candidates
       (candidate_type, proposed_action, source_observation_id, proposed_global_product_id,
        proposed_variant_id, proposed_barcode, proposed_alias, proposed_data,
        tenant_id, shop_id, created_by, review_status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'pending')
     RETURNING id, candidate_type AS "candidateType", review_status AS "reviewStatus"`,
    [input.candidateType, input.proposedAction ?? null, input.sourceObservationId ?? null,
      input.proposedGlobalProductId ?? null, input.proposedVariantId ?? null,
      input.proposedBarcode ? normalizeBarcode(input.proposedBarcode) : null,
      input.proposedAlias ?? null, input.proposedData != null ? JSON.stringify(input.proposedData) : null,
      ctx.tenantId, ctx.shopId, ctx.userId],
  );
  return rows[0];
}
