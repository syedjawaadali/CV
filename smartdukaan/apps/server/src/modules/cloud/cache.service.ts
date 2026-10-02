/**
 * AI result cache (Phase 4). A safe, validated cloud result keyed by
 * content-hash + ocr-hash + provider + model + prompt version + candidate-set
 * version + country. Reusing a cached result avoids a duplicate paid call.
 *
 * A cache entry is NEVER reused when its prompt/model/candidate context changed,
 * when it was invalidated (product corrected, packaging retired), or when it has
 * expired. The cache stores only the validated structured result — never raw
 * provider prose or chain-of-thought.
 */
import { createHash } from 'node:crypto';
import { query } from '../../db/pool.js';
import { CLOUD_CONFIG } from './config.js';
import type { CloudRecognitionResult } from '@smartdukaan/shared';

export interface CacheKeyParts {
  contentHash: string | null;
  ocrTextHash: string | null;
  provider: string;
  model: string;
  modelVersion: string;
  promptVersion: string;
  candidateSetVersion: string;
  country: string;
}

export function cacheKeyOf(p: CacheKeyParts): string {
  const raw = [
    p.contentHash ?? '', p.ocrTextHash ?? '', p.provider, p.model, p.modelVersion,
    p.promptVersion, p.candidateSetVersion, p.country,
  ].join('|');
  return createHash('sha256').update(raw).digest('hex');
}

export interface CachedResult {
  result: CloudRecognitionResult;
  confidenceCategory: string | null;
}

export async function lookup(key: string): Promise<CachedResult | null> {
  const res = await query<{ result: CloudRecognitionResult; confidence_category: string | null }>(
    `SELECT result, confidence_category FROM ai_result_cache
      WHERE cache_key = $1 AND NOT invalidated
        AND (expires_at IS NULL OR expires_at > now())
      LIMIT 1`,
    [key],
  );
  const row = res.rows[0];
  if (!row) return null;
  await query(`UPDATE ai_result_cache SET usage_count = usage_count + 1, last_used_at = now() WHERE cache_key = $1`, [key]);
  return { result: row.result, confidenceCategory: row.confidence_category };
}

export async function store(
  key: string, parts: CacheKeyParts, result: CloudRecognitionResult, confidenceCategory: string, now: Date,
): Promise<void> {
  const expires = new Date(now.getTime() + CLOUD_CONFIG.cache.ttlMs).toISOString();
  await query(
    `INSERT INTO ai_result_cache
       (cache_key, content_hash, ocr_text_hash, provider, model, model_version, prompt_version,
        candidate_set_version, country, result, confidence_category, usage_count, last_used_at, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,1,now(),$12)
     ON CONFLICT (cache_key) DO UPDATE SET usage_count = ai_result_cache.usage_count + 1, last_used_at = now()`,
    [key, parts.contentHash, parts.ocrTextHash, parts.provider, parts.model, parts.modelVersion,
      parts.promptVersion, parts.candidateSetVersion, parts.country, JSON.stringify(result), confidenceCategory, expires],
  );
}

/** Invalidate cached results for a content hash (e.g. product corrected). */
export async function invalidateByContentHash(contentHash: string): Promise<void> {
  await query(`UPDATE ai_result_cache SET invalidated = TRUE WHERE content_hash = $1`, [contentHash]);
}
