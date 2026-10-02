/**
 * AI usage repository (Phase 4). Append-only record of every cloud recognition
 * attempt for cost/observability. Never stores images or secrets — only sizes,
 * ids, versions, estimated cost and outcome.
 */
import { query } from '../../db/pool.js';

export interface UsageEvent {
  tenantId: string;
  shopId: string;
  userId: string | null;
  deviceId?: string | null;
  recognitionSessionId?: string | null;
  observationId?: string | null;
  provider: string;
  model?: string | null;
  modelVersion?: string | null;
  promptVersion?: string | null;
  requestType?: string;
  inputImageCount?: number;
  inputImageBytes?: number;
  inputTextBytes?: number;
  outputBytes?: number;
  estimatedCostMinor?: number;
  actualCostMinor?: number | null;
  latencyMs?: number | null;
  cacheStatus?: 'hit' | 'miss' | 'dedup' | 'n/a';
  fallbackReason?: string | null;
  resultStatus?: string;
  errorCode?: string | null;
}

export async function recordUsage(e: UsageEvent): Promise<void> {
  await query(
    `INSERT INTO ai_usage_events
       (tenant_id, shop_id, user_id, device_id, recognition_session_id, observation_id,
        provider, model, model_version, prompt_version, request_type,
        input_image_count, input_image_bytes, input_text_bytes, output_bytes,
        estimated_cost_minor, actual_cost_minor, latency_ms, cache_status, fallback_reason,
        result_status, error_code)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)`,
    [
      e.tenantId, e.shopId, e.userId ?? null, e.deviceId ?? null, e.recognitionSessionId ?? null, e.observationId ?? null,
      e.provider, e.model ?? null, e.modelVersion ?? null, e.promptVersion ?? null, e.requestType ?? 'analyze_product_image',
      e.inputImageCount ?? 0, e.inputImageBytes ?? 0, e.inputTextBytes ?? 0, e.outputBytes ?? 0,
      e.estimatedCostMinor ?? 0, e.actualCostMinor ?? null, e.latencyMs ?? null, e.cacheStatus ?? 'miss', e.fallbackReason ?? null,
      e.resultStatus ?? 'completed', e.errorCode ?? null,
    ],
  );
}

export interface UsageDashboardRow {
  totalRequests: number;
  cacheHits: number;
  failures: number;
  estimatedCostMinor: number;
  avgLatencyMs: number | null;
}

/** Tenant-scoped dashboard aggregate for today (never crosses tenants). */
export async function tenantUsageToday(tenantId: string): Promise<UsageDashboardRow> {
  const res = await query<{
    total: string; hits: string; failures: string; cost: string; avg_latency: string | null;
  }>(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE cache_status='hit')::int AS hits,
            count(*) FILTER (WHERE result_status <> 'completed')::int AS failures,
            COALESCE(sum(estimated_cost_minor),0)::text AS cost,
            avg(latency_ms) AS avg_latency
       FROM ai_usage_events
      WHERE tenant_id = $1 AND created_at >= date_trunc('day', now())`,
    [tenantId],
  );
  const r = res.rows[0]!;
  return {
    totalRequests: Number(r.total), cacheHits: Number(r.hits), failures: Number(r.failures),
    estimatedCostMinor: Number(r.cost), avgLatencyMs: r.avg_latency != null ? Math.round(Number(r.avg_latency)) : null,
  };
}
