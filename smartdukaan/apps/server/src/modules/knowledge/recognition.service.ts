import {
  analyzeBarcode, normalizeText, normalizeBarcode, extractAttributes,
  scoreCandidate, confidenceCategory, decideAction, RECOGNITION_CONFIG,
  type CandidateEvidence, type BarcodeEvidence, type ExtractedAttributes,
} from '@smartdukaan/shared';
import { query, withTransaction } from '../../db/pool.js';

/**
 * Local-first product recognition (Phase 3). Combines barcode evidence with
 * deterministic OCR-text attributes, retrieves retailer + shared candidates,
 * scores them (shared/scoring), applies the centralized confidence policy, and
 * persists the observation + candidates. It NEVER changes inventory or price —
 * it only identifies and records evidence for human confirmation.
 */

interface Ctx { tenantId: string; shopId: string; userId: string }

export interface RecognizeInput {
  barcode?: string | null;
  ocrText?: string | null;
  offline?: boolean;
  deviceId?: string | null;
  ocrProvider?: string | null;
  ocrProviderVersion?: string | null;
  processingMs?: number | null;
  imageQuality?: string | null;
}

interface CandidateRow {
  kind: 'retailer' | 'shared';
  retailerProductId: string | null;
  globalProductId: string | null;
  productVariantId: string | null;
  displayName: string;
  brand: string | null;
  packSummary: string | null;
  baseQuantity: number | null;
  baseUnit: string | null;
  verificationStatus: string | null;
  ev: CandidateEvidence;
}

function sharedBarcodeEvidence(verification: string): BarcodeEvidence {
  return verification === 'verified' ? 'shared_verified' : 'shared_unverified';
}

export async function recognize(ctx: Ctx, input: RecognizeInput) {
  const attrs: ExtractedAttributes = extractAttributes(input.ocrText ?? '');
  const info = input.barcode ? analyzeBarcode(input.barcode) : null;
  const normBarcode = info?.normalized ?? '';
  const candidateNames = new Set(attrs.brandNameCandidates);
  if (attrs.normalizedText) candidateNames.add(attrs.normalizedText);

  const observationType = input.barcode && input.ocrText ? 'combined'
    : input.barcode ? 'barcode' : input.ocrText ? 'ocr' : 'manual_search';

  const candidates: CandidateRow[] = [];

  // --- Retailer products (small catalogs: fetch active set, match in JS) ------
  const retailer = await query<{
    id: string; name: string; name_ur: string | null; barcode: string | null; unit: string;
    selling_price_minor: number; product_variant_id: string | null; updated_at: string;
  }>(
    `SELECT id, name, name_ur, barcode, unit, selling_price_minor, product_variant_id, updated_at
       FROM products WHERE shop_id = $1 AND active
      ORDER BY updated_at DESC LIMIT 300`,
    [ctx.shopId],
  );
  const recentIds = new Set(retailer.rows.slice(0, 10).map((r) => r.id));
  for (const p of retailer.rows) {
    const nameNorm = normalizeText(p.name);
    const nameUrNorm = normalizeText(p.name_ur ?? '');
    const barcodeMatch = !!normBarcode && normalizeBarcode(p.barcode ?? '') === normBarcode;
    const nameMatch = candidateNames.has(nameNorm) || (!!nameUrNorm && candidateNames.has(nameUrNorm))
      || (!!nameNorm && attrs.normalizedText.includes(nameNorm));
    if (!barcodeMatch && !nameMatch) continue;
    candidates.push({
      kind: 'retailer', retailerProductId: p.id, globalProductId: null,
      productVariantId: p.product_variant_id, displayName: p.name, brand: null,
      packSummary: p.unit, baseQuantity: null, baseUnit: null, verificationStatus: null,
      ev: {
        barcode: barcodeMatch ? 'retailer_exact' : undefined,
        exactNormalizedName: nameMatch, existingCatalogLink: !!p.product_variant_id,
        recentlyUsed: recentIds.has(p.id),
      },
    });
  }

  // --- Shared catalog: by barcode ---------------------------------------------
  if (normBarcode) {
    const sb = await query<{
      variant_id: string; global_id: string; name: string; brand: string | null;
      base_quantity: number | null; base_unit: string | null; pack_unit: string | null;
      pack_quantity: number | null; verification: string;
    }>(
      `SELECT v.id AS variant_id, g.id AS global_id, g.canonical_name AS name, g.brand,
              v.base_quantity, v.base_unit, v.pack_unit, v.pack_quantity, b.verification_status AS verification
         FROM product_barcodes b
         JOIN product_variants v ON v.id = b.product_variant_id
         JOIN global_products g ON g.id = v.global_product_id
        WHERE b.ownership_scope = 'global' AND b.is_active AND b.barcode_normalized = $1
        LIMIT 10`,
      [normBarcode],
    );
    const conflict = sb.rows.length > 1;
    for (const r of sb.rows) {
      candidates.push(makeSharedCandidate(r, conflict ? 'multiple' : sharedBarcodeEvidence(r.verification), attrs));
    }
  }

  // --- Shared catalog: by name / alias ----------------------------------------
  if (candidateNames.size > 0) {
    const names = [...candidateNames];
    const sn = await query<{
      variant_id: string; global_id: string; name: string; brand: string | null;
      base_quantity: number | null; base_unit: string | null; pack_unit: string | null; pack_quantity: number | null;
    }>(
      `SELECT DISTINCT v.id AS variant_id, g.id AS global_id, g.canonical_name AS name, g.brand,
              v.base_quantity, v.base_unit, v.pack_unit, v.pack_quantity
         FROM product_variants v
         JOIN global_products g ON g.id = v.global_product_id
         LEFT JOIN product_aliases a ON a.product_variant_id = v.id AND a.ownership_scope='global' AND a.is_active
        WHERE g.is_active AND (
              g.canonical_name_normalized = ANY($1)
           OR v.variant_name_normalized = ANY($1)
           OR a.normalized_alias = ANY($1))
        LIMIT 10`,
      [names],
    );
    for (const r of sn.rows) {
      if (candidates.some((c) => c.productVariantId === r.variant_id)) continue;
      candidates.push(makeSharedCandidate({ ...r, verification: 'unverified' }, undefined, attrs));
    }
  }

  // --- Score + rank ------------------------------------------------------------
  const scored = candidates.map((c) => {
    const res = scoreCandidate(c.ev);
    const category = confidenceCategory(res, c.ev);
    return { c, res, category };
  }).sort((a, b) => b.res.score - a.res.score).slice(0, RECOGNITION_CONFIG.candidateLimit);

  const top = scored[0];
  const overallCategory = top ? confidenceCategory(top.res, top.c.ev) : 'low';
  const topIsRetailer = top?.c.kind === 'retailer';
  const recommendedAction = top ? decideAction(overallCategory, topIsRetailer) : 'manual_or_create';

  // --- Packaging-change + price-change evaluation (deterministic) -------------
  const packagingChange = evaluatePackagingChange(top, attrs);
  const priceChange = await evaluatePriceChange(ctx, top, attrs);

  // --- Persist observation + candidates ---------------------------------------
  const observationId = await withTransaction(async (tx) => {
    const obs = await tx.query<{ id: string }>(
      `INSERT INTO recognition_observations
         (tenant_id, shop_id, user_id, device_id, observation_type, raw_value, normalized_value,
          barcode_value, candidate_count, status, ocr_full_text, ocr_provider, ocr_provider_version,
          processing_ms, image_quality, extracted_attributes, confidence_category, recommended_action, offline)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING id`,
      [
        ctx.tenantId, ctx.shopId, ctx.userId, input.deviceId ?? null, observationType,
        input.ocrText ?? null, attrs.normalizedText || null, normBarcode || null, scored.length,
        overallCategory === 'conflict' ? 'open' : scored.length ? 'open' : 'unmatched',
        input.ocrText ?? null, input.ocrProvider ?? null, input.ocrProviderVersion ?? null,
        input.processingMs ?? null, input.imageQuality ?? null,
        JSON.stringify(summarizeAttrs(attrs)), overallCategory, recommendedAction, !!input.offline,
      ],
    );
    const id = obs.rows[0]!.id;
    let rank = 1;
    for (const s of scored) {
      await tx.query(
        `INSERT INTO recognition_candidates
           (observation_id, global_product_id, product_variant_id, retailer_product_id,
            candidate_rank, confidence, match_reasons, contradictions, confidence_category, display_name)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [id, s.c.globalProductId, s.c.productVariantId, s.c.retailerProductId, rank++,
          scoreToConfidence(s.res.score), JSON.stringify(s.res.reasons),
          JSON.stringify(s.res.contradictions), s.category, s.c.displayName],
      );
    }
    return id;
  });

  return {
    observationId,
    confidence: overallCategory,
    recommendedAction,
    offline: !!input.offline,
    barcode: info ? { normalized: normBarcode, classification: info.classification } : null,
    extractedAttributes: summarizeAttrs(attrs),
    candidates: scored.map((s, i) => ({
      rank: i + 1,
      retailerProductId: s.c.retailerProductId,
      globalProductId: s.c.globalProductId,
      productVariantId: s.c.productVariantId,
      displayName: s.c.displayName,
      brand: s.c.brand,
      packSize: s.c.packSummary,
      matchScore: s.res.score,
      confidenceCategory: s.category,
      matchReasons: s.res.reasons,
      contradictions: s.res.contradictions,
      verificationStatus: s.c.verificationStatus,
      source: s.c.kind,
    })),
    packagingChange,
    priceChange,
  };
}

function makeSharedCandidate(
  r: { variant_id: string; global_id: string; name: string; brand: string | null;
       base_quantity: number | null; base_unit: string | null; pack_unit: string | null;
       pack_quantity: number | null; verification: string },
  barcode: BarcodeEvidence | undefined, attrs: ExtractedAttributes,
): CandidateRow {
  const brandMatch = !!r.brand && attrs.normalizedText.includes(normalizeText(r.brand));
  const packSizeMatch = packSizeMatches(attrs, r.base_quantity, r.base_unit);
  const packSizeContradiction = barcode !== undefined && packSizeMatch === false;
  return {
    kind: 'shared', retailerProductId: null, globalProductId: r.global_id, productVariantId: r.variant_id,
    displayName: r.name, brand: r.brand,
    packSummary: r.pack_quantity != null ? `${r.pack_quantity} ${r.pack_unit ?? ''}`.trim() : null,
    baseQuantity: r.base_quantity, baseUnit: r.base_unit, verificationStatus: r.verification,
    ev: {
      barcode,
      exactGlobalAlias: candidateNameHit(attrs, r.name),
      exactNormalizedName: normalizeText(r.name) === attrs.normalizedText,
      brandMatch, packSizeMatch, packSizeContradiction,
    },
  };
}

function candidateNameHit(attrs: ExtractedAttributes, name: string): boolean {
  const n = normalizeText(name);
  return attrs.brandNameCandidates.includes(n) || (!!n && attrs.normalizedText.includes(n));
}

/** true / false / null(unknown) whether OCR pack size matches a known base size. */
function packSizeMatches(attrs: ExtractedAttributes, baseQty: number | null, baseUnit: string | null): boolean | null {
  if (!attrs.packSize || attrs.packSize.baseQuantity == null || !baseUnit || baseQty == null) return null;
  return attrs.packSize.baseUnit === baseUnit && Math.abs(attrs.packSize.baseQuantity - Number(baseQty)) < 0.001;
}

function evaluatePackagingChange(
  top: { c: CandidateRow; res: { contradictions: string[] } } | undefined, attrs: ExtractedAttributes,
) {
  if (!top) return null;
  const priceKnown = !!attrs.printedPrice;
  if (top.c.ev.packSizeContradiction) {
    return { classification: 'possible_different_variant', note: 'The pack size on the package looks different.' };
  }
  if (top.c.ev.barcode && (attrs.promotional.isPromotional || priceKnown)) {
    return { classification: attrs.promotional.isPromotional ? 'promotional_package' : 'possible_update',
      note: 'Same product, but the packaging may have changed.' };
  }
  return null;
}

async function evaluatePriceChange(
  ctx: Ctx, top: { c: CandidateRow } | undefined, attrs: ExtractedAttributes,
) {
  if (!attrs.printedPrice || !top?.c.retailerProductId) return null;
  const observedMinor = attrs.printedPrice.amountMinor;
  const prev = await query<{ amount_minor: number }>(
    `SELECT amount_minor FROM price_observations
      WHERE retailer_product_id = $1 AND price_type = 'printed_mrp'
      ORDER BY observed_at DESC LIMIT 1`,
    [top.c.retailerProductId],
  );
  const sell = await query<{ selling_price_minor: number }>(
    `SELECT selling_price_minor FROM products WHERE id = $1`, [top.c.retailerProductId],
  );
  const previousMinor = prev.rows[0]?.amount_minor ?? null;
  const sellingPriceMinor = sell.rows[0]?.selling_price_minor ?? null;
  const differs = previousMinor != null ? previousMinor !== observedMinor
    : sellingPriceMinor != null ? sellingPriceMinor !== observedMinor : true;
  return {
    observedPrintedMinor: observedMinor, previousPrintedMinor: previousMinor,
    sellingPriceMinor, differs,
    note: 'Printed price detected. Your selling price is unchanged — review it if you like.',
  };
}

function summarizeAttrs(a: ExtractedAttributes) {
  return {
    packSize: a.packSize ? {
      original: a.packSize.originalText, unit: a.packSize.unit,
      baseQuantity: a.packSize.baseQuantity, baseUnit: a.packSize.baseUnit, confidence: a.packSize.confidence,
    } : null,
    printedPrice: a.printedPrice ? {
      amountMinor: a.printedPrice.amountMinor, currency: a.printedPrice.currency,
      confidence: a.printedPrice.confidence,
    } : null,
    manufacturer: a.manufacturer,
    promotional: a.promotional,
    brandNameCandidates: a.brandNameCandidates,
  };
}

function scoreToConfidence(score: number): number {
  return Math.max(0, Math.min(1, Number((score / 100).toFixed(3))));
}
