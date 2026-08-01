/**
 * Phase 2 feature flags. Safe defaults: the Knowledge Base is ON, but every
 * enhanced path is designed to fall back to the existing product flow if
 * disabled. Flags are read from the environment so a deploy can flip one
 * without a code change; unknown/missing values fall back to the default.
 */
function flag(name: string, defaultValue: boolean): boolean {
  const v = process.env[name];
  if (v == null || v === '') return defaultValue;
  return v === '1' || v.toLowerCase() === 'true';
}

export const features = {
  productKnowledgeBase: flag('FEATURE_PRODUCT_KNOWLEDGE_BASE', true),
  sharedCatalogSearch: flag('FEATURE_SHARED_CATALOG_SEARCH', true),
  enhancedBarcodeLookup: flag('FEATURE_ENHANCED_BARCODE_LOOKUP', true),
  catalogSuggestions: flag('FEATURE_CATALOG_SUGGESTIONS', true),
  productPriceHistory: flag('FEATURE_PRODUCT_PRICE_HISTORY', true),
  packagingVersions: flag('FEATURE_PACKAGING_VERSIONS', true),
  // Phase 3 — local OCR + hybrid recognition (fall back to Phase 2 barcode flow).
  localOcr: flag('FEATURE_LOCAL_OCR', true),
  hybridProductScan: flag('FEATURE_HYBRID_PRODUCT_SCAN', true),
  packagingChangeDetection: flag('FEATURE_PACKAGING_CHANGE_DETECTION', true),
  printedPriceDetection: flag('FEATURE_PRINTED_PRICE_DETECTION', true),
  offlineProductRecognition: flag('FEATURE_OFFLINE_PRODUCT_RECOGNITION', true),
} as const;

export type FeatureName = keyof typeof features;
