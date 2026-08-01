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
} as const;

export type FeatureName = keyof typeof features;
