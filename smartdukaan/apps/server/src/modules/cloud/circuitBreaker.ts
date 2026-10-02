/**
 * Provider circuit breaker (Phase 4). Persisted per (provider, model) so it
 * holds across requests. When too many failures accumulate the circuit opens
 * and cloud calls are skipped (local recognition + cache + manual remain), which
 * prevents repeated provider charges during an outage.
 *
 * States: closed (normal) -> open (skip provider) -> half_open (one trial).
 */
import { query } from '../../db/pool.js';
import { CLOUD_CONFIG } from './config.js';

export type CircuitState = 'closed' | 'open' | 'half_open';

async function loadOrInit(provider: string, model: string) {
  await query(
    `INSERT INTO ai_provider_health (provider, model) VALUES ($1,$2)
     ON CONFLICT (provider, model) DO NOTHING`,
    [provider, model],
  );
  const res = await query<{
    health_status: CircuitState; failure_count: number; circuit_open_until: string | null;
  }>(
    `SELECT health_status, failure_count, circuit_open_until FROM ai_provider_health WHERE provider=$1 AND model=$2`,
    [provider, model],
  );
  return res.rows[0]!;
}

/** Returns whether a call is permitted right now, transitioning open->half_open. */
export async function canRequest(provider: string, model: string, now: Date): Promise<{ allowed: boolean; state: CircuitState }> {
  const h = await loadOrInit(provider, model);
  if (h.health_status === 'open') {
    if (h.circuit_open_until && new Date(h.circuit_open_until) <= now) {
      await query(`UPDATE ai_provider_health SET health_status='half_open', updated_at=now() WHERE provider=$1 AND model=$2`, [provider, model]);
      return { allowed: true, state: 'half_open' };
    }
    return { allowed: false, state: 'open' };
  }
  return { allowed: true, state: h.health_status };
}

export async function recordSuccess(provider: string, model: string, latencyMs: number): Promise<void> {
  await query(
    `UPDATE ai_provider_health
        SET health_status='closed', failure_count=0, success_count=success_count+1,
            last_success_at=now(), circuit_open_until=NULL,
            avg_latency_ms = COALESCE((avg_latency_ms + $3)/2, $3), updated_at=now()
      WHERE provider=$1 AND model=$2`,
    [provider, model, latencyMs],
  );
}

export async function recordFailure(provider: string, model: string, now: Date): Promise<void> {
  const h = await loadOrInit(provider, model);
  const failures = h.failure_count + 1;
  if (failures >= CLOUD_CONFIG.cloud.failureThreshold) {
    const openUntil = new Date(now.getTime() + CLOUD_CONFIG.cloud.circuitOpenMs).toISOString();
    await query(
      `UPDATE ai_provider_health SET health_status='open', failure_count=$3, last_failure_at=now(),
          circuit_open_until=$4, updated_at=now() WHERE provider=$1 AND model=$2`,
      [provider, model, failures, openUntil],
    );
  } else {
    await query(
      `UPDATE ai_provider_health SET failure_count=$3, last_failure_at=now(), updated_at=now()
        WHERE provider=$1 AND model=$2`,
      [provider, model, failures],
    );
  }
}
