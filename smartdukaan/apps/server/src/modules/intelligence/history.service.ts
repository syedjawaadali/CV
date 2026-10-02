/**
 * Sales-history service (Phase 6). Builds a per-day unit-demand series for a
 * product from completed sale_items over a window. Amount-only sales have no
 * sale_items, so they are naturally excluded from product-level demand.
 */
import { query } from '../../db/pool.js';

interface Ctx { shopId: string }

/** Ordered array of daily unit totals (oldest → newest) across `windowDays`. */
export async function dailyDemandSeries(ctx: Ctx, productId: string, now: Date, windowDays = 21): Promise<number[]> {
  const { rows } = await query<{ day: string; units: string }>(
    `SELECT date_trunc('day', s.created_at) AS day, COALESCE(sum(si.quantity),0)::text AS units
       FROM sale_items si JOIN sales s ON s.id = si.sale_id
      WHERE s.shop_id = $1 AND si.product_id = $2
        AND s.created_at >= $3::timestamptz - ($4 || ' days')::interval
      GROUP BY 1 ORDER BY 1`,
    [ctx.shopId, productId, now.toISOString(), windowDays],
  );
  // Fill missing days with 0 so the series length reflects the full window.
  const byDay = new Map<string, number>();
  for (const r of rows) byDay.set(new Date(r.day).toISOString().slice(0, 10), Number(r.units));
  const series: number[] = [];
  for (let i = windowDays - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    series.push(byDay.get(d) ?? 0);
  }
  return series;
}
