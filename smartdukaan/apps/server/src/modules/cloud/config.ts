/**
 * Centralized Phase 4 configuration. Every tunable for visual matching and
 * cloud-AI cost governance lives here (not scattered as literals). Values are
 * validation hypotheses; adjust here after field measurement.
 */
import { env } from '../../config/env.js';

export const CLOUD_CONFIG = {
  image: {
    maxBytes: 4 * 1024 * 1024,      // 4 MB hard cap on an upload
    maxPixels: 24_000_000,          // decompression-bomb guard (~24 MP)
    minPixels: 64 * 64,             // too-small images are rejected
    allowedMime: ['image/jpeg', 'image/png', 'image/webp'] as const,
    targetMaxEdge: 1024,            // minimize to this longest edge before upload
    jpegQuality: 0.7,
  },
  visual: {
    candidateLimit: 10,
    // Distances mirror shared PHASH_CONFIG; kept here for the retrieval layer.
    phashNearIdentical: 6,
    phashSimilar: 12,
  },
  cloud: {
    provider: env.ai.provider,          // 'mock' | 'gemini'
    model: env.ai.geminiModel,
    timeoutMs: 12_000,
    maxRetries: 1,                      // one retry, transient errors only
    retryBaseMs: 400,
    // Circuit breaker
    failureThreshold: 5,
    circuitOpenMs: 60_000,
    // Fallback is considered only when local confidence is below this.
    fallbackBelowCategory: 'medium' as const,
  },
  budget: {
    dailyRequestLimit: env.ai.dailyRequestLimit,
    dailyCostLimitMinor: env.ai.dailyCostLimitMinor,
    warningThresholdPct: 80,
  },
  rateLimit: {
    perUserPerMinute: 12,
    perShopPerMinute: 40,
    perDevicePerMinute: 12,
  },
  cache: {
    ttlMs: 30 * 24 * 60 * 60 * 1000,   // 30 days for a confirmed-safe cloud result
  },
  retention: {
    tempImageMs: 24 * 60 * 60 * 1000,  // temporary scan images: 24h
  },
} as const;

/**
 * Default cost basis for estimation (PKR minor units / paisa). This is an
 * ESTIMATE, not an invoice; real pricing is provider-billed. Overridable via
 * the ai_cost_config table.
 */
export const DEFAULT_COST_BASIS = {
  provider: env.ai.provider,
  model: env.ai.geminiModel,
  perImageMinor: 300,        // ~PKR 3.00 estimate per image analysis
  per1kInputMinor: 5,
  per1kOutputMinor: 15,
  minChargeMinor: 100,
  currency: 'PKR',
} as const;
