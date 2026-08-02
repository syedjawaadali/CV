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
  // Public/open barcode database lookup (Open Food Facts) — prefill only, never
  // auto-creates a product. Degrades gracefully if the provider is unreachable.
  externalBarcodeLookup: flag('FEATURE_EXTERNAL_BARCODE_LOOKUP', true),
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
  // Phase 5 — voice assistant. The assistant + deterministic intent engine are
  // ON; cloud speech / AI-assisted intent (paid) are OFF by default. Disabling
  // voiceAssistant restores the pure-UI experience.
  voiceAssistant: flag('FEATURE_VOICE_ASSISTANT', true),
  localSpeechToText: flag('FEATURE_LOCAL_SPEECH_TO_TEXT', true),
  cloudSpeechToText: flag('FEATURE_CLOUD_SPEECH_TO_TEXT', false),
  voiceIntentEngine: flag('FEATURE_VOICE_INTENT_ENGINE', true),
  voiceProductCommands: flag('FEATURE_VOICE_PRODUCT_COMMANDS', true),
  voiceInventoryCommands: flag('FEATURE_VOICE_INVENTORY_COMMANDS', true),
  voiceSalesCommands: flag('FEATURE_VOICE_SALES_COMMANDS', true),
  voiceKhataCommands: flag('FEATURE_VOICE_KHATA_COMMANDS', true),
  voiceExpenseCommands: flag('FEATURE_VOICE_EXPENSE_COMMANDS', true),
  voiceReportQueries: flag('FEATURE_VOICE_REPORT_QUERIES', true),
  textToSpeech: flag('FEATURE_TEXT_TO_SPEECH', true),
  voiceMemory: flag('FEATURE_VOICE_MEMORY', true),
  offlineVoice: flag('FEATURE_OFFLINE_VOICE', true),
  voiceCloudFallback: flag('FEATURE_VOICE_CLOUD_FALLBACK', false),
  // Phase 6 — inventory intelligence. Deterministic rules + forecasting on;
  // proactive spoken alerts (while app closed) and sponsored offers off by default.
  inventoryIntelligence: flag('FEATURE_INVENTORY_INTELLIGENCE', true),
  deterministicLowStockAlerts: flag('FEATURE_DETERMINISTIC_LOW_STOCK_ALERTS', true),
  stockoutProjection: flag('FEATURE_STOCKOUT_PROJECTION', true),
  demandBaseline: flag('FEATURE_DEMAND_BASELINE', true),
  reorderSuggestions: flag('FEATURE_REORDER_SUGGESTIONS', true),
  expiryAlerts: flag('FEATURE_EXPIRY_ALERTS', true),
  anomalyAlerts: flag('FEATURE_ANOMALY_ALERTS', true),
  slowMovingIndicators: flag('FEATURE_SLOW_MOVING_INDICATORS', true),
  dailyOpeningSummary: flag('FEATURE_DAILY_OPENING_SUMMARY', true),
  dailyClosingSummary: flag('FEATURE_DAILY_CLOSING_SUMMARY', true),
  proactiveSpokenAlerts: flag('FEATURE_PROACTIVE_SPOKEN_ALERTS', false),
  alertGrouping: flag('FEATURE_ALERT_GROUPING', true),
  offlineInventoryIntelligence: flag('FEATURE_OFFLINE_INVENTORY_INTELLIGENCE', true),
  sponsoredSupplierOffers: flag('FEATURE_SPONSORED_SUPPLIER_OFFERS', false),
} as const;

export type FeatureName = keyof typeof features;
