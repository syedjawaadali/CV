/**
 * Alert engine (Phase 6). Recomputes deterministic alerts from the common
 * snapshot, deduplicates against stored alerts (so a re-run does not create
 * duplicates), auto-resolves conditions that no longer hold, and manages the
 * alert lifecycle (acknowledge / snooze / dismiss / resolve). It NEVER changes
 * inventory. Forecast-based urgency is layered on top of deterministic alerts.
 */
import {
  evaluateRules, dedupKey, alertPriority, DEFAULT_RULES,
  type DeterministicAlert, type ProductImportance,
} from '@smartdukaan/shared';
import { query, withTransaction } from '../../db/pool.js';
import { writeAudit } from '../../lib/audit.js';
import { notFound, forbidden } from '../../lib/errors.js';
import { shopSnapshots } from './snapshot.service.js';

interface Ctx { tenantId: string; shopId: string; userId: string }

export interface StoredAlert {
  id: string; productId: string | null; alertType: string; severity: string;
  explanation: string; status: string; conditionKey: string; priority: number;
  generatedAt: string; snoozedUntil: string | null;
}

/**
 * Evaluate the whole shop: generate/refresh deterministic alerts, resolve stale
 * ones, and return the currently-open alerts sorted by priority.
 */
export async function evaluateShop(ctx: Ctx, now: Date): Promise<StoredAlert[]> {
  const bundles = await shopSnapshots(ctx, now);
  const fresh: Array<{ a: DeterministicAlert; importance: ProductImportance }> = [];
  for (const b of bundles) {
    const alerts = evaluateRules(b.snapshot, {
      now: now.getTime(),
      lastAdjustmentDelta: b.lastAdjustmentDelta,
      daysSinceStockCount: b.daysSinceStockCount,
      openingStockRecorded: b.openingStockRecorded,
    }, DEFAULT_RULES);
    for (const a of alerts) fresh.push({ a, importance: b.snapshot.importance });
  }

  const freshKeys = new Set(fresh.map(({ a }) => dedupKey(ctx.tenantId, ctx.shopId, a)));

  await withTransaction(async (tx) => {
    // Upsert each fresh alert; a re-run with the same condition does NOT duplicate.
    for (const { a } of fresh) {
      const key = dedupKey(ctx.tenantId, ctx.shopId, a);
      await tx.query(
        `INSERT INTO inventory_alerts
           (tenant_id, shop_id, product_id, alert_type, severity, dedup_key, condition_key,
            condition_version, explanation, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'generated')
         ON CONFLICT (tenant_id, dedup_key) DO UPDATE
           SET explanation = EXCLUDED.explanation, severity = EXCLUDED.severity, updated_at = now(),
               -- Re-open a resolved/expired condition that recurs; leave snoozed/dismissed as-is.
               status = CASE WHEN inventory_alerts.status IN ('resolved','expired','invalidated')
                             THEN 'generated' ELSE inventory_alerts.status END`,
        [ctx.tenantId, ctx.shopId, a.productId, a.type, a.severity, key, a.conditionKey,
          a.conditionVersion, a.explanation],
      );
    }

    // Auto-resolve open alerts whose condition no longer holds (and weren't dismissed).
    const open = await tx.query<{ id: string; dedup_key: string; status: string }>(
      `SELECT id, dedup_key, status FROM inventory_alerts
        WHERE tenant_id=$1 AND shop_id=$2 AND status IN ('generated','delivered','viewed','acknowledged','snoozed')`,
      [ctx.tenantId, ctx.shopId],
    );
    for (const row of open.rows) {
      if (!freshKeys.has(row.dedup_key)) {
        await tx.query(`UPDATE inventory_alerts SET status='resolved', resolved_at=now(), updated_at=now() WHERE id=$1`, [row.id]);
      }
    }
  });

  return listOpenAlerts(ctx, now);
}

/** Currently-actionable alerts (open + not snoozed), highest priority first. */
export async function listOpenAlerts(ctx: Ctx, now: Date): Promise<StoredAlert[]> {
  const { rows } = await query<{
    id: string; product_id: string | null; alert_type: string; severity: string; explanation: string;
    status: string; condition_key: string; generated_at: string; snoozed_until: string | null;
    importance: string | null;
  }>(
    `SELECT a.id, a.product_id, a.alert_type, a.severity, a.explanation, a.status, a.condition_key,
            a.generated_at, a.snoozed_until, p.importance
       FROM inventory_alerts a LEFT JOIN products p ON p.id = a.product_id
      WHERE a.tenant_id=$1 AND a.shop_id=$2
        AND a.status IN ('generated','delivered','viewed','acknowledged','snoozed')
        AND (a.snoozed_until IS NULL OR a.snoozed_until <= $3)`,
    [ctx.tenantId, ctx.shopId, now.toISOString()],
  );
  return rows
    .map((r): StoredAlert => ({
      id: r.id, productId: r.product_id, alertType: r.alert_type, severity: r.severity,
      explanation: r.explanation, status: r.status, conditionKey: r.condition_key,
      priority: alertPriority({ severity: r.severity as never, importance: (r.importance ?? 'normal') as ProductImportance }),
      generatedAt: r.generated_at, snoozedUntil: r.snoozed_until,
    }))
    .sort((a, b) => b.priority - a.priority);
}

export type AlertActionType = 'acknowledge' | 'snooze' | 'dismiss' | 'resolve';

export async function actOnAlert(
  ctx: Ctx, alertId: string, action: AlertActionType, snoozeHours = 24,
): Promise<{ status: string }> {
  const found = await query<{ id: string; status: string }>(
    `SELECT id, status FROM inventory_alerts WHERE id=$1 AND shop_id=$2`, [alertId, ctx.shopId],
  );
  if (found.rows.length === 0) throw notFound('Alert not found');

  const status = action === 'acknowledge' ? 'acknowledged'
    : action === 'snooze' ? 'snoozed' : action === 'dismiss' ? 'dismissed' : 'resolved';
  const snoozedUntil = action === 'snooze' ? new Date(Date.now() + snoozeHours * 3600_000).toISOString() : null;

  await withTransaction(async (tx) => {
    await tx.query(
      `UPDATE inventory_alerts
          SET status=$2, snoozed_until=$3,
              dismiss_count = dismiss_count + CASE WHEN $2='dismissed' THEN 1 ELSE 0 END,
              resolved_at = CASE WHEN $2='resolved' THEN now() ELSE resolved_at END,
              updated_at = now()
        WHERE id=$1`,
      [alertId, status, snoozedUntil],
    );
    await tx.query(
      `INSERT INTO alert_actions (alert_id, tenant_id, shop_id, user_id, action_type, action_value)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [alertId, ctx.tenantId, ctx.shopId, ctx.userId, action, snoozedUntil],
    );
  });
  await writeAudit({
    tenantId: ctx.tenantId, shopId: ctx.shopId, actorUserId: ctx.userId,
    action: `alert.${action}`, resourceType: 'inventory_alert', resourceId: alertId,
  });
  return { status };
}

/** Guard: only staff who can view inventory may read alerts (checked at route). */
export function assertShop(ctx: Ctx, shopId: string): void {
  if (ctx.shopId !== shopId) throw forbidden('Cross-shop access is not allowed');
}
