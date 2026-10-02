import { toMinor } from '@smartdukaan/shared';
import { query } from '../../db/pool.js';
import { conflict } from '../../lib/errors.js';

const SHOP_TZ = 'Asia/Karachi';

interface Ctx { tenantId: string; shopId: string; userId: string }

/** Aggregates money movements for a business date (in the shop timezone). */
async function computeTotals(shopId: string, businessDate: string) {
  const sales = await query<{ method: string; total: string }>(
    `SELECT payment_method AS method, COALESCE(SUM(total_minor),0)::text AS total
       FROM sales
      WHERE shop_id = $1 AND status = 'completed'
        AND (created_at AT TIME ZONE $2)::date = $3::date
      GROUP BY payment_method`,
    [shopId, SHOP_TZ, businessDate],
  );
  let cash = 0, digital = 0, credit = 0;
  for (const r of sales.rows) {
    if (r.method === 'cash') cash = Number(r.total);
    else if (r.method === 'digital') digital = Number(r.total);
    else if (r.method === 'credit') credit = Number(r.total);
  }

  // Khata payments collected in cash reduce the customer's balance
  // (amount_minor is negative), so cash collected = -SUM(amount).
  const khata = await query<{ collected: string }>(
    `SELECT COALESCE(SUM(-amount_minor),0)::text AS collected
       FROM khata_transactions
      WHERE shop_id = $1 AND type = 'payment' AND method = 'cash'
        AND (created_at AT TIME ZONE $2)::date = $3::date`,
    [shopId, SHOP_TZ, businessDate],
  );
  const khataCashCollected = Number(khata.rows[0]!.collected);

  const exp = await query<{ total: string }>(
    `SELECT COALESCE(SUM(amount_minor),0)::text AS total
       FROM expenses
      WHERE shop_id = $1 AND (created_at AT TIME ZONE $2)::date = $3::date`,
    [shopId, SHOP_TZ, businessDate],
  );
  const expenses = Number(exp.rows[0]!.total);

  const expectedCash = cash + khataCashCollected - expenses;
  return {
    cashSalesMinor: cash,
    digitalSalesMinor: digital,
    creditSalesMinor: credit,
    khataCollectedMinor: khataCashCollected,
    expensesMinor: expenses,
    expectedCashMinor: expectedCash,
  };
}

export async function preview(ctx: Ctx, businessDate: string) {
  const totals = await computeTotals(ctx.shopId, businessDate);
  const existing = await query(
    'SELECT id FROM daily_closings WHERE shop_id = $1 AND business_date = $2::date',
    [ctx.shopId, businessDate],
  );
  return { businessDate, ...totals, alreadyClosed: (existing.rowCount ?? 0) > 0 };
}

export async function submitClosing(
  ctx: Ctx, input: { businessDate: string; countedCash: number; note?: string | null },
) {
  const existing = await query(
    'SELECT id FROM daily_closings WHERE shop_id = $1 AND business_date = $2::date',
    [ctx.shopId, input.businessDate],
  );
  if ((existing.rowCount ?? 0) > 0) {
    throw conflict('This day has already been closed.');
  }
  const totals = await computeTotals(ctx.shopId, input.businessDate);
  const countedCash = toMinor(input.countedCash);
  const difference = countedCash - totals.expectedCashMinor;

  const { rows } = await query(
    `INSERT INTO daily_closings
       (tenant_id, shop_id, business_date, cash_sales_minor, digital_sales_minor,
        credit_sales_minor, khata_collected_minor, expenses_minor, expected_cash_minor,
        counted_cash_minor, difference_minor, note, created_by)
     VALUES ($1,$2,$3::date,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     RETURNING id, business_date AS "businessDate",
               cash_sales_minor AS "cashSalesMinor", digital_sales_minor AS "digitalSalesMinor",
               credit_sales_minor AS "creditSalesMinor", khata_collected_minor AS "khataCollectedMinor",
               expenses_minor AS "expensesMinor", expected_cash_minor AS "expectedCashMinor",
               counted_cash_minor AS "countedCashMinor", difference_minor AS "differenceMinor",
               note, created_at AS "createdAt"`,
    [
      ctx.tenantId, ctx.shopId, input.businessDate, totals.cashSalesMinor, totals.digitalSalesMinor,
      totals.creditSalesMinor, totals.khataCollectedMinor, totals.expensesMinor, totals.expectedCashMinor,
      countedCash, difference, input.note ?? null, ctx.userId,
    ],
  );
  return rows[0];
}

export async function listClosings(ctx: Ctx, limit = 30) {
  const { rows } = await query(
    `SELECT d.id, d.business_date AS "businessDate",
            d.cash_sales_minor AS "cashSalesMinor", d.digital_sales_minor AS "digitalSalesMinor",
            d.credit_sales_minor AS "creditSalesMinor", d.khata_collected_minor AS "khataCollectedMinor",
            d.expenses_minor AS "expensesMinor", d.expected_cash_minor AS "expectedCashMinor",
            d.counted_cash_minor AS "countedCashMinor", d.difference_minor AS "differenceMinor",
            d.note, u.name AS "createdByName", d.created_at AS "createdAt"
       FROM daily_closings d JOIN users u ON u.id = d.created_by
      WHERE d.shop_id = $1
      ORDER BY d.business_date DESC LIMIT $2`,
    [ctx.shopId, limit],
  );
  return { data: rows };
}
