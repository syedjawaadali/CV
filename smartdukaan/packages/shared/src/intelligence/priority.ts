/**
 * Alert priority + deduplication + frequency policy (Phase 6) — pure. Ranks
 * alerts so integrity/urgent items beat helpful ones (and promotions never
 * outrank a real stock need), and provides the dedup key + repeat policy so the
 * same condition is not re-alerted without a MEANINGFUL change.
 */
import type { AlertSeverity, AlertType, DeterministicAlert } from './rules.js';
import type { ProductImportance } from './snapshot.js';

const SEVERITY_RANK: Record<AlertSeverity, number> = { critical: 400, urgent: 300, important: 200, helpful: 100 };
const IMPORTANCE_BOOST: Record<ProductImportance, number> = { essential: 40, important: 25, normal: 10, optional: 0, seasonal: 5 };

export interface PriorityInputs {
  severity: AlertSeverity;
  importance: ProductImportance;
  daysRemaining?: number | null;
  hasPendingCustomerOrder?: boolean;
  alreadyActed?: boolean;
  repeatedDismissals?: number;
}

/** Higher score = surfaced first. */
export function alertPriority(i: PriorityInputs): number {
  let score = SEVERITY_RANK[i.severity] + IMPORTANCE_BOOST[i.importance];
  if (i.hasPendingCustomerOrder) score += 60;
  if (typeof i.daysRemaining === 'number') score += Math.max(0, 30 - i.daysRemaining * 5);
  if (i.alreadyActed) score -= 120;
  if (i.repeatedDismissals) score -= Math.min(100, i.repeatedDismissals * 30);
  return score;
}

/** Full deduplication key: same condition (product+type+bucket) within a tenant/shop. */
export function dedupKey(tenantId: string, shopId: string, alert: DeterministicAlert): string {
  return `${tenantId}:${shopId}:${alert.conditionKey}:v${alert.conditionVersion}`;
}

/**
 * Whether a stored alert should re-surface. Re-surfaces only on a MEANINGFUL
 * change (a different condition bucket) or after a snooze has expired.
 */
export function shouldResurface(prev: {
  conditionKey: string; status: string; snoozedUntilMs?: number | null;
}, next: DeterministicAlert, nowMs: number): boolean {
  // A different bucket (e.g. low → zero) is a new condition.
  if (prev.conditionKey !== next.conditionKey) return true;
  if (prev.status === 'snoozed' && prev.snoozedUntilMs != null) return nowMs >= prev.snoozedUntilMs;
  // Same condition, still open/delivered → do not repeat.
  return false;
}

export const FREQUENCY = {
  dailyCap: 20,          // max alerts surfaced per shop per day
  perProductCap: 3,      // max alerts per product per day
  snoozeDefaultMs: 24 * 60 * 60 * 1000,
};

/** Group alerts of the same type for a single summary line. */
export function groupByType(alerts: DeterministicAlert[]): Map<AlertType, DeterministicAlert[]> {
  const m = new Map<AlertType, DeterministicAlert[]>();
  for (const a of alerts) {
    const arr = m.get(a.type) ?? [];
    arr.push(a);
    m.set(a.type, arr);
  }
  return m;
}
