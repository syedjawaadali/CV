import { query } from '../db/pool.js';

/**
 * Expire overdue orders (no background worker in this setup — we expire on
 * read). Any non-terminal order past its pickup_by becomes 'expired'. When the
 * order had a paid deposit (advance_paid), that's a genuine no-show: the
 * deposit is forfeited to the shop and the buyer's no_show_count is bumped.
 *
 * Scoped by shop or customer so a read only settles the caller's own orders.
 */
export async function expireOverdueOrders(scope: { shopId?: string; customerId?: string }): Promise<void> {
  const filters: string[] = [
    `status IN ('pending_payment','confirmed','accepted','ready')`,
    'pickup_by IS NOT NULL',
    'pickup_by < now()',
  ];
  const params: unknown[] = [];
  if (scope.shopId) { params.push(scope.shopId); filters.push(`shop_id = $${params.length}`); }
  if (scope.customerId) { params.push(scope.customerId); filters.push(`customer_account_id = $${params.length}`); }

  await query(
    `WITH expired AS (
       UPDATE orders SET status = 'expired', updated_at = now()
        WHERE ${filters.join(' AND ')}
        RETURNING customer_account_id, advance_paid
     )
     UPDATE customer_accounts c
        SET no_show_count = no_show_count + 1
       FROM expired e
      WHERE e.customer_account_id = c.id AND e.advance_paid = TRUE`,
    params,
  );
}
