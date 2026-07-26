import type { DashboardSummary } from '@smartdukaan/shared';
import { query } from '../../db/pool.js';

const SHOP_TZ = 'Asia/Karachi';

interface Ctx { shopId: string }

export async function getSummary(ctx: Ctx): Promise<DashboardSummary> {
  const shopId = ctx.shopId;

  // Today's date in the shop timezone.
  const dateRow = await query<{ d: string }>(
    `SELECT (now() AT TIME ZONE $1)::date::text AS d`, [SHOP_TZ],
  );
  const today = dateRow.rows[0]!.d;

  const salesByMethod = await query<{ method: string; total: string; cnt: string }>(
    `SELECT payment_method AS method, COALESCE(SUM(total_minor),0)::text AS total, COUNT(*)::text AS cnt
       FROM sales
      WHERE shop_id = $1 AND status = 'completed'
        AND (created_at AT TIME ZONE $2)::date = $3::date
      GROUP BY payment_method`,
    [shopId, SHOP_TZ, today],
  );
  let cash = 0, credit = 0, digital = 0, count = 0;
  for (const r of salesByMethod.rows) {
    const t = Number(r.total);
    count += Number(r.cnt);
    if (r.method === 'cash') cash = t;
    else if (r.method === 'credit') credit = t;
    else if (r.method === 'digital') digital = t;
  }
  const todaySales = cash + credit + digital;

  const khata = await query<{ collected: string }>(
    `SELECT COALESCE(SUM(-amount_minor),0)::text AS collected
       FROM khata_transactions
      WHERE shop_id = $1 AND type = 'payment'
        AND (created_at AT TIME ZONE $2)::date = $3::date`,
    [shopId, SHOP_TZ, today],
  );

  const exp = await query<{ total: string }>(
    `SELECT COALESCE(SUM(amount_minor),0)::text AS total
       FROM expenses
      WHERE shop_id = $1 AND (created_at AT TIME ZONE $2)::date = $3::date`,
    [shopId, SHOP_TZ, today],
  );

  const outstanding = await query<{ total: string }>(
    `SELECT COALESCE(SUM(balance_minor),0)::text AS total
       FROM customers WHERE shop_id = $1 AND balance_minor > 0`,
    [shopId],
  );

  // Estimated gross profit for product-line sales today (uses current cost).
  const profit = await query<{ profit: string; missing_cost: string }>(
    `SELECT
        COALESCE(SUM(si.line_total_minor - (p.cost_price_minor * si.quantity)),0)::text AS profit,
        COALESCE(SUM(CASE WHEN p.cost_price_minor = 0 THEN 1 ELSE 0 END),0)::text AS missing_cost
       FROM sale_items si
       JOIN sales s ON s.id = si.sale_id
       JOIN products p ON p.id = si.product_id
      WHERE s.shop_id = $1 AND s.status = 'completed'
        AND (s.created_at AT TIME ZONE $2)::date = $3::date`,
    [shopId, SHOP_TZ, today],
  );

  const amountOnly = await query<{ cnt: string }>(
    `SELECT COUNT(*)::text AS cnt FROM sales
      WHERE shop_id = $1 AND status = 'completed' AND amount_only
        AND (created_at AT TIME ZONE $2)::date = $3::date`,
    [shopId, SHOP_TZ, today],
  );

  const lowStock = await query<{ cnt: string }>(
    `SELECT COUNT(*)::text AS cnt FROM products
      WHERE shop_id = $1 AND active AND stock_qty <= low_stock_threshold`,
    [shopId],
  );

  const closing = await query<{ cnt: string }>(
    `SELECT COUNT(*)::text AS cnt FROM daily_closings
      WHERE shop_id = $1 AND business_date = $2::date`,
    [shopId, today],
  );

  const missingCost = Number(profit.rows[0]!.missing_cost) > 0;
  const hasAmountOnly = Number(amountOnly.rows[0]!.cnt) > 0;

  return {
    date: today,
    todaySalesMinor: todaySales,
    cashSalesMinor: cash,
    creditSalesMinor: credit,
    digitalSalesMinor: digital,
    khataCollectedTodayMinor: Number(khata.rows[0]!.collected),
    expensesTodayMinor: Number(exp.rows[0]!.total),
    outstandingKhataMinor: Number(outstanding.rows[0]!.total),
    estimatedProfitMinor: Number(profit.rows[0]!.profit),
    profitIsEstimated: missingCost || hasAmountOnly,
    lowStockCount: Number(lowStock.rows[0]!.cnt),
    saleCountToday: count,
    closingDoneToday: Number(closing.rows[0]!.cnt) > 0,
  };
}
