/**
 * AI budget service (Phase 4). Enforces per-tenant/shop request + estimated-cost
 * limits with a reserve -> consume -> release lifecycle so concurrent requests
 * can never exceed a budget. All money is integer minor units (paisa).
 *
 * Budget exhaustion NEVER blocks local/manual product entry — only the cloud
 * call. The caller treats a failed reservation as "cloud unavailable" and falls
 * back to local recognition.
 */
import { withTransaction, query, type Sql } from '../../db/pool.js';
import { CLOUD_CONFIG } from './config.js';

export interface BudgetContext { tenantId: string; shopId: string }

export interface Reservation {
  ok: boolean;
  reason: 'ok' | 'request_limit' | 'cost_limit' | 'disabled';
  budgetId: string | null;
  reservedCostMinor: number;
  warning: boolean; // crossed the warning threshold
}

function todayKey(now: Date): string {
  return now.toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}

/** Ensure a daily shop budget row exists and return it locked FOR UPDATE. */
async function lockDailyBudget(tx: Sql, ctx: BudgetContext, periodKey: string) {
  await tx.query(
    `INSERT INTO ai_budgets (scope, tenant_id, shop_id, period_type, period_key,
        request_limit, estimated_cost_limit_minor, warning_threshold_pct)
     VALUES ('shop',$1,$2,'daily',$3,$4,$5,$6)
     ON CONFLICT (scope, COALESCE(tenant_id,'00000000-0000-0000-0000-000000000000'),
                  COALESCE(shop_id,'00000000-0000-0000-0000-000000000000'), period_type, period_key)
     DO NOTHING`,
    [ctx.tenantId, ctx.shopId, periodKey,
      CLOUD_CONFIG.budget.dailyRequestLimit, CLOUD_CONFIG.budget.dailyCostLimitMinor,
      CLOUD_CONFIG.budget.warningThresholdPct],
  );
  const res = await tx.query<{
    id: string; request_limit: number; estimated_cost_limit_minor: string;
    used_requests: number; used_estimated_cost_minor: string;
    reserved_requests: number; reserved_cost_minor: string; warning_threshold_pct: number; hard_limit: boolean;
  }>(
    `SELECT * FROM ai_budgets
      WHERE scope='shop' AND shop_id=$1 AND period_type='daily' AND period_key=$2
      FOR UPDATE`,
    [ctx.shopId, periodKey],
  );
  return res.rows[0]!;
}

/** Reserve one request + its max estimated cost. Atomic; safe under concurrency. */
export async function reserve(ctx: BudgetContext, maxCostMinor: number, now: Date): Promise<Reservation> {
  const periodKey = todayKey(now);
  return withTransaction(async (tx) => {
    const b = await lockDailyBudget(tx, ctx, periodKey);
    const usedReq = b.used_requests + b.reserved_requests;
    const usedCost = BigInt(b.used_estimated_cost_minor) + BigInt(b.reserved_cost_minor);
    const reqLimit = b.request_limit;
    const costLimit = BigInt(b.estimated_cost_limit_minor);

    if (reqLimit > 0 && usedReq + 1 > reqLimit) {
      return { ok: false, reason: 'request_limit', budgetId: b.id, reservedCostMinor: 0, warning: true };
    }
    if (costLimit > 0n && usedCost + BigInt(maxCostMinor) > costLimit) {
      return { ok: false, reason: 'cost_limit', budgetId: b.id, reservedCostMinor: 0, warning: true };
    }
    await tx.query(
      `UPDATE ai_budgets SET reserved_requests = reserved_requests + 1,
          reserved_cost_minor = reserved_cost_minor + $2, updated_at = now()
        WHERE id = $1`,
      [b.id, maxCostMinor],
    );
    const projectedPct = reqLimit > 0 ? Math.round(((usedReq + 1) / reqLimit) * 100) : 0;
    return {
      ok: true, reason: 'ok', budgetId: b.id, reservedCostMinor: maxCostMinor,
      warning: projectedPct >= b.warning_threshold_pct,
    };
  });
}

/** Convert a reservation into actual usage (or partial). Releases the remainder. */
export async function consume(budgetId: string, reservedCostMinor: number, actualCostMinor: number): Promise<void> {
  await query(
    `UPDATE ai_budgets
        SET used_requests = used_requests + 1,
            used_estimated_cost_minor = used_estimated_cost_minor + $2,
            reserved_requests = GREATEST(0, reserved_requests - 1),
            reserved_cost_minor = GREATEST(0, reserved_cost_minor - $3),
            updated_at = now()
      WHERE id = $1`,
    [budgetId, Math.max(0, actualCostMinor), reservedCostMinor],
  );
}

/** Release a reservation without consuming it (request failed/cancelled). */
export async function release(budgetId: string, reservedCostMinor: number): Promise<void> {
  await query(
    `UPDATE ai_budgets
        SET reserved_requests = GREATEST(0, reserved_requests - 1),
            reserved_cost_minor = GREATEST(0, reserved_cost_minor - $2),
            updated_at = now()
      WHERE id = $1`,
    [budgetId, reservedCostMinor],
  );
}

export interface UsageSummary {
  periodKey: string;
  usedRequests: number;
  requestLimit: number;
  remainingRequests: number | null;
  usedEstimatedCostMinor: number;
  estimatedCostLimitMinor: number;
  currency: string;
  category: 'ok' | 'warning' | 'exhausted';
}

/** Tenant-safe usage summary (no secret billing internals). */
export async function usageSummary(ctx: BudgetContext, now: Date): Promise<UsageSummary> {
  const periodKey = todayKey(now);
  const res = await query<{
    request_limit: number; estimated_cost_limit_minor: string; used_requests: number;
    used_estimated_cost_minor: string; reserved_requests: number; warning_threshold_pct: number; currency: string;
  }>(
    `SELECT request_limit, estimated_cost_limit_minor, used_requests, used_estimated_cost_minor,
            reserved_requests, warning_threshold_pct, currency
       FROM ai_budgets WHERE scope='shop' AND shop_id=$1 AND period_type='daily' AND period_key=$2`,
    [ctx.shopId, periodKey],
  );
  const row = res.rows[0];
  const reqLimit = row?.request_limit ?? CLOUD_CONFIG.budget.dailyRequestLimit;
  const used = (row?.used_requests ?? 0) + (row?.reserved_requests ?? 0);
  const warnPct = row?.warning_threshold_pct ?? CLOUD_CONFIG.budget.warningThresholdPct;
  const remaining = reqLimit > 0 ? Math.max(0, reqLimit - used) : null;
  let category: UsageSummary['category'] = 'ok';
  if (reqLimit > 0 && used >= reqLimit) category = 'exhausted';
  else if (reqLimit > 0 && (used / reqLimit) * 100 >= warnPct) category = 'warning';
  return {
    periodKey,
    usedRequests: used,
    requestLimit: reqLimit,
    remainingRequests: remaining,
    usedEstimatedCostMinor: Number(row?.used_estimated_cost_minor ?? 0),
    estimatedCostLimitMinor: Number(row?.estimated_cost_limit_minor ?? CLOUD_CONFIG.budget.dailyCostLimitMinor),
    currency: row?.currency ?? 'PKR',
    category,
  };
}
