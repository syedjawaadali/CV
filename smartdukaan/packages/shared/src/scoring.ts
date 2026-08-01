/**
 * Deterministic candidate scoring + centralized confidence policy (Phase 3).
 * NO generative model. Every score is explainable via structured match reasons
 * and contradictions. The single most important safety property: strong signals
 * that DISAGREE must never yield a high-confidence auto-selection — they yield
 * a CONFLICT that forces the retailer to choose.
 *
 * Weights and thresholds are INITIAL VALIDATION HYPOTHESES — they require field
 * validation on real Pakistani packaging before being treated as tuned.
 */

export type BarcodeEvidence =
  | 'retailer_exact' | 'shared_verified' | 'shared_unverified'
  | 'internal' | 'multiple' | 'conflict' | 'invalid' | 'none';

export interface RecognitionConfig {
  weights: Record<string, number>;
  negatives: Record<string, number>;
  thresholds: { exact: number; high: number; medium: number };
  candidateLimit: number;
}

export const RECOGNITION_CONFIG: RecognitionConfig = {
  weights: {
    retailer_exact_barcode: 100,
    shared_verified_barcode: 95, // a verified shared barcode is an exact identification
    shared_unverified_barcode: 60,
    internal_barcode: 40,
    exact_retailer_alias: 70,
    exact_global_alias: 55,
    exact_normalized_name: 50,
    brand_match: 25,
    variant_match: 20,
    pack_size_match: 25,
    units_per_pack_match: 10,
    manufacturer_match: 15,
    recently_used: 12,
    existing_catalog_link: 20,
    packaging_text_similarity: 20, // multiplied by similarity 0..1
    current_packaging_match: 10,
    printed_price_consistent: 5,
  },
  negatives: {
    conflicting_barcode: -1000,
    pack_size_contradiction: -60,
    brand_contradiction: -50,
    manufacturer_contradiction: -20,
    product_form_contradiction: -30,
    variant_contradiction: -40,
    suspicious_packaging: -40,
    retired_product: -1000,
    inactive_barcode: -30,
    conflicted_record: -1000,
  },
  thresholds: { exact: 95, high: 70, medium: 40 },
  candidateLimit: 10,
};

export type ConfidenceCategory = 'exact' | 'high' | 'medium' | 'low' | 'conflict';

export interface CandidateEvidence {
  barcode?: BarcodeEvidence;
  exactRetailerAlias?: boolean;
  exactGlobalAlias?: boolean;
  exactNormalizedName?: boolean;
  brandMatch?: boolean;
  variantMatch?: boolean;
  packSizeMatch?: boolean | null;
  unitsPerPackMatch?: boolean;
  manufacturerMatch?: boolean;
  recentlyUsed?: boolean;
  existingCatalogLink?: boolean;
  packagingTextSimilarity?: number; // 0..1
  currentPackagingMatch?: boolean;
  printedPriceConsistent?: boolean;
  // negative evidence
  packSizeContradiction?: boolean;
  brandContradiction?: boolean;
  manufacturerContradiction?: boolean;
  productFormContradiction?: boolean;
  variantContradiction?: boolean;
  suspiciousPackaging?: boolean;
  retired?: boolean;
  inactiveBarcode?: boolean;
  conflictedRecord?: boolean;
}

export interface MatchReason { code: string; label: string; weight: number }

export interface ScoreResult {
  score: number;
  reasons: MatchReason[];
  contradictions: string[];
  hardConflict: boolean;
}

const N = RECOGNITION_CONFIG.negatives;

export function scoreCandidate(ev: CandidateEvidence, cfg: RecognitionConfig = RECOGNITION_CONFIG): ScoreResult {
  const reasons: MatchReason[] = [];
  const contradictions: string[] = [];
  let score = 0;
  const add = (cond: boolean | undefined | null, code: string, label: string, weight: number | undefined) => {
    const w = weight ?? 0;
    if (cond) { score += w; reasons.push({ code, label, weight: w }); }
  };
  const sub = (cond: boolean | undefined, _code: string, label: string, weight: number | undefined) => {
    if (cond) { score += (weight ?? 0); contradictions.push(label); }
  };

  switch (ev.barcode) {
    case 'retailer_exact': add(true, 'barcode_retailer', 'Barcode matches your existing product', cfg.weights.retailer_exact_barcode); break;
    case 'shared_verified': add(true, 'barcode_shared_verified', 'Barcode matches a verified catalog product', cfg.weights.shared_verified_barcode); break;
    case 'shared_unverified': add(true, 'barcode_shared_unverified', 'Barcode matches an unverified catalog product', cfg.weights.shared_unverified_barcode); break;
    case 'internal': add(true, 'barcode_internal', 'In-store barcode recognized', cfg.weights.internal_barcode); break;
    default: break;
  }

  add(ev.exactRetailerAlias, 'alias_retailer', 'Matches your product name', cfg.weights.exact_retailer_alias);
  add(ev.exactGlobalAlias, 'alias_global', 'Matches a known product name', cfg.weights.exact_global_alias);
  add(ev.exactNormalizedName, 'name_exact', 'Product name matches', cfg.weights.exact_normalized_name);
  add(ev.brandMatch, 'brand', 'Brand matches', cfg.weights.brand_match);
  add(ev.variantMatch, 'variant', 'Variant matches', cfg.weights.variant_match);
  add(ev.packSizeMatch === true, 'pack_size', 'Pack size matches', cfg.weights.pack_size_match);
  add(ev.unitsPerPackMatch, 'units_per_pack', 'Pack count matches', cfg.weights.units_per_pack_match);
  add(ev.manufacturerMatch, 'manufacturer', 'Manufacturer matches', cfg.weights.manufacturer_match);
  add(ev.recentlyUsed, 'recent', 'You used this product recently', cfg.weights.recently_used);
  add(ev.existingCatalogLink, 'catalog_link', 'Already linked in your catalog', cfg.weights.existing_catalog_link);
  add(ev.currentPackagingMatch, 'packaging_current', 'Matches the current packaging', cfg.weights.current_packaging_match);
  add(ev.printedPriceConsistent, 'price_consistent', 'Printed price is consistent', cfg.weights.printed_price_consistent);
  if (typeof ev.packagingTextSimilarity === 'number' && ev.packagingTextSimilarity > 0) {
    const w = Math.round((cfg.weights.packaging_text_similarity ?? 0) * Math.min(1, ev.packagingTextSimilarity));
    if (w > 0) { score += w; reasons.push({ code: 'packaging_text', label: 'Packaging text is similar', weight: w }); }
  }

  sub(ev.barcode === 'conflict', 'barcode_conflict', 'This barcode is used by more than one product', N.conflicting_barcode);
  sub(ev.packSizeContradiction, 'pack_size_conflict', 'The pack size appears different', N.pack_size_contradiction);
  sub(ev.brandContradiction, 'brand_conflict', 'The brand appears different', N.brand_contradiction);
  sub(ev.manufacturerContradiction, 'manufacturer_conflict', 'The manufacturer appears different', N.manufacturer_contradiction);
  sub(ev.productFormContradiction, 'form_conflict', 'The product form appears different', N.product_form_contradiction);
  sub(ev.variantContradiction, 'variant_conflict', 'The variant appears different', N.variant_contradiction);
  sub(ev.suspiciousPackaging, 'suspicious', 'The packaging looks suspicious', N.suspicious_packaging);
  sub(ev.retired, 'retired', 'This product is retired', N.retired_product);
  sub(ev.inactiveBarcode, 'inactive_barcode', 'This barcode is inactive', N.inactive_barcode);
  sub(ev.conflictedRecord, 'conflicted_record', 'This catalog record is conflicted', N.conflicted_record);

  const hardConflict = !!(ev.barcode === 'conflict' || ev.retired || ev.conflictedRecord);
  return { score, reasons, contradictions, hardConflict };
}

/** Overall confidence for the TOP candidate. Contradictions cap confidence;
 *  a pack-size contradiction on a barcode match becomes an explicit conflict. */
export function confidenceCategory(
  top: ScoreResult, ev: CandidateEvidence, cfg: RecognitionConfig = RECOGNITION_CONFIG,
): ConfidenceCategory {
  if (top.hardConflict || ev.barcode === 'multiple') return 'conflict';
  const barcodeMatch = ev.barcode === 'retailer_exact' || ev.barcode === 'shared_verified';
  if (barcodeMatch && (ev.packSizeContradiction || ev.brandContradiction || ev.variantContradiction)) return 'conflict';
  if (top.contradictions.length > 0) {
    // With contradictions we never auto-select; cap at medium at best.
    return top.score >= cfg.thresholds.high ? 'medium' : top.score >= cfg.thresholds.medium ? 'medium' : 'low';
  }
  if (top.score >= cfg.thresholds.exact) return 'exact';
  if (top.score >= cfg.thresholds.high) return 'high';
  if (top.score >= cfg.thresholds.medium) return 'medium';
  return 'low';
}

export type RecommendedAction =
  | 'select_existing_product' | 'add_shared_product_to_shop' | 'preselect_confirm'
  | 'show_candidates' | 'manual_or_create' | 'resolve_conflict';

export function decideAction(category: ConfidenceCategory, topIsRetailer: boolean): RecommendedAction {
  switch (category) {
    case 'conflict': return 'resolve_conflict';
    case 'exact': return topIsRetailer ? 'select_existing_product' : 'add_shared_product_to_shop';
    case 'high': return 'preselect_confirm';
    case 'medium': return 'show_candidates';
    default: return 'manual_or_create';
  }
}
