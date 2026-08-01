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
  // Phase 4 — local visual matching is ON (cheap, private, on-device-friendly);
  // everything that spends money on cloud AI is OFF by default and must be
  // explicitly enabled per environment. Disabling cloud returns the Phase 3 flow.
  localImageFingerprint: flag('FEATURE_LOCAL_IMAGE_FINGERPRINT', true),
  localVisualMatching: flag('FEATURE_LOCAL_VISUAL_MATCHING', true),
  localImageEmbedding: flag('FEATURE_LOCAL_IMAGE_EMBEDDING', false),
  sharedVisualMatching: flag('FEATURE_SHARED_VISUAL_MATCHING', true),
  cloudProductRecognition: flag('FEATURE_CLOUD_PRODUCT_RECOGNITION', false),
  cloudRecognitionConsent: flag('FEATURE_CLOUD_RECOGNITION_CONSENT', true),
  cloudRecognitionCache: flag('FEATURE_CLOUD_RECOGNITION_CACHE', true),
  cloudRecognitionBudget: flag('FEATURE_CLOUD_RECOGNITION_BUDGET', true),
  cloudRecognitionSecondaryModel: flag('FEATURE_CLOUD_RECOGNITION_SECONDARY_MODEL', false),
  packagingVisualChangeDetection: flag('FEATURE_PACKAGING_VISUAL_CHANGE_DETECTION', true),
  aiUsageDashboard: flag('FEATURE_AI_USAGE_DASHBOARD', true),
} as const;

export type FeatureName = keyof typeof features;
