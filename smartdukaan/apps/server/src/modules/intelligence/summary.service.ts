/**
 * Business-summary service (Phase 6). Builds opening / closing / on-demand
 * summaries from REAL data (snapshots + dashboard totals), applying privacy
 * mode. Uses the shared summary builder for consistent, bounded, privacy-aware
 * spoken output. Never invents delivery certainty or figures.
 */
import { buildSummary, type SummaryInput } from '@smartdukaan/shared';
import { query } from '../../db/pool.js';
import { getSummary } from '../dashboard/dashboard.service.js';
import { evaluateShop } from './alerts.service.js';

interface Ctx { tenantId: string; shopId: string; userId: string }

export async function businessSummary(
  ctx: Ctx, kind: SummaryInput['kind'], now: Date, opts?: { privacyMode?: boolean; language?: SummaryInput['language'] },
) {
  const alerts = await evaluateShop(ctx, now);
  const oos = alerts.filter((a) => a.alertType === 'out_of_stock').length;
  const low = alerts.filter((a) => a.alertType === 'low_stock').length;
  const expiring = alerts.filter((a) => a.alertType === 'expiring_soon' || a.alertType === 'expired').length;
  const conflicts = alerts.filter((a) => a.alertType === 'conflict' || a.alertType === 'negative_stock').length;
  const pendingSync = alerts.filter((a) => a.alertType === 'pending_sync').length;

  // Most-urgent product names (bounded), from the highest-priority alerts.
  const urgentNames = await namesFor(ctx.shopId, alerts.slice(0, 6).map((a) => a.productId).filter(Boolean) as string[]);

  const input: SummaryInput = {
    kind,
    outOfStock: oos, lowStock: low, expiringSoon: expiring, conflicts, pendingSync,
    topUrgentNames: urgentNames,
    totalAttentionItems: alerts.filter((a) => a.severity !== 'helpful').length,
    language: opts?.language ?? 'en',
    incomingDeliveries: await pendingDrafts(ctx.shopId),
  };

  if (kind === 'closing') {
    const dash = await getSummary(ctx) as { todaySalesMinor?: number; expensesTodayMinor?: number };
    input.unitsSoldToday = await unitsSoldToday(ctx.shopId);
    input.refilledToday = await refilledToday(ctx.shopId);
    input.salesTodayMajor = dash.todaySalesMinor != null ? dash.todaySalesMinor / 100 : null;
    input.expensesTodayMajor = dash.expensesTodayMinor != null ? dash.expensesTodayMinor / 100 : null;
  }

  const built = buildSummary(input, { privacyMode: opts?.privacyMode });
  return { ...built, counts: { outOfStock: oos, lowStock: low, expiring, conflicts, pendingSync } };
}

async function namesFor(shopId: string, productIds: string[]): Promise<string[]> {
  if (productIds.length === 0) return [];
  const { rows } = await query<{ id: string; name: string }>(
    `SELECT id, name FROM products WHERE shop_id=$1 AND id = ANY($2)`, [shopId, productIds],
  );
  const byId = new Map(rows.map((r) => [r.id, r.name]));
  // Preserve the priority order of productIds.
  return productIds.map((id) => byId.get(id)).filter((n): n is string => !!n);
}

async function pendingDrafts(shopId: string): Promise<number> {
  const { rows } = await query<{ n: number }>(
    `SELECT count(*)::int n FROM purchase_drafts WHERE shop_id=$1 AND status IN ('draft','submitted')`, [shopId]);
  return rows[0]?.n ?? 0;
}
async function unitsSoldToday(shopId: string): Promise<number> {
  const { rows } = await query<{ n: string }>(
    `SELECT COALESCE(sum(si.quantity),0)::text n FROM sale_items si JOIN sales s ON s.id=si.sale_id
      WHERE s.shop_id=$1 AND s.created_at >= date_trunc('day', now())`, [shopId]);
  return Math.round(Number(rows[0]?.n ?? 0));
}
async function refilledToday(shopId: string): Promise<number> {
  const { rows } = await query<{ n: number }>(
    `SELECT count(DISTINCT product_id)::int n FROM inventory_movements
      WHERE shop_id=$1 AND type IN ('purchase','opening','return') AND quantity_delta > 0
        AND created_at >= date_trunc('day', now())`, [shopId]);
  return rows[0]?.n ?? 0;
}
