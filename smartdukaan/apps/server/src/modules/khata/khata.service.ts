import type { PoolClient } from 'pg';
import { toMinor } from '@smartdukaan/shared';
import { withTransaction, query } from '../../db/pool.js';
import { badRequest, notFound } from '../../lib/errors.js';

interface Ctx { tenantId: string; shopId: string; userId: string }

async function lockCustomer(tx: PoolClient, shopId: string, customerId: string): Promise<number> {
  const { rows } = await tx.query<{ balance_minor: string }>(
    'SELECT balance_minor FROM customers WHERE id = $1 AND shop_id = $2 FOR UPDATE',
    [customerId, shopId],
  );
  if (!rows[0]) throw notFound('Customer not found');
  return Number(rows[0].balance_minor);
}

/**
 * Appends a khata transaction and updates the customer's cached balance in one
 * transaction. `signedAmount` is positive for credit (customer owes more),
 * negative for a payment (customer owes less). History is never rewritten.
 */
async function appendTransaction(
  tx: PoolClient, ctx: Ctx,
  args: { customerId: string; type: 'credit' | 'payment'; signedAmount: number; method?: 'cash' | 'digital'; note?: string | null },
) {
  const current = await lockCustomer(tx, ctx.shopId, args.customerId);
  const after = current + args.signedAmount;
  await tx.query(
    'UPDATE customers SET balance_minor = $1, updated_at = now() WHERE id = $2',
    [after, args.customerId],
  );
  const { rows } = await tx.query(
    `INSERT INTO khata_transactions
       (tenant_id, shop_id, customer_id, type, amount_minor, balance_after_minor, method, note, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING id, type, amount_minor AS "amountMinor", balance_after_minor AS "balanceAfterMinor",
               note, created_at AS "createdAt"`,
    [ctx.tenantId, ctx.shopId, args.customerId, args.type, args.signedAmount, after,
     args.method ?? null, args.note ?? null, ctx.userId],
  );
  return { transaction: rows[0], balanceAfterMinor: after };
}

export function addCredit(ctx: Ctx, input: { customerId: string; amount: number; note?: string | null }) {
  const amount = toMinor(input.amount);
  if (amount <= 0) throw badRequest('Amount must be greater than zero');
  return withTransaction((tx) =>
    appendTransaction(tx, ctx, { customerId: input.customerId, type: 'credit', signedAmount: amount, note: input.note }),
  );
}

export function recordPayment(
  ctx: Ctx,
  input: { customerId: string; amount: number; method: 'cash' | 'digital'; note?: string | null },
) {
  const amount = toMinor(input.amount);
  if (amount <= 0) throw badRequest('Amount must be greater than zero');
  // Overpayment is allowed (creates an advance / negative balance) and is never
  // silently clamped — the balance simply reflects it.
  return withTransaction((tx) =>
    appendTransaction(tx, ctx, {
      customerId: input.customerId, type: 'payment', signedAmount: -amount, method: input.method, note: input.note,
    }),
  );
}

export async function getStatement(ctx: Ctx, customerId: string) {
  const customer = await query(
    `SELECT id, name, phone, locality, balance_minor AS "balanceMinor"
       FROM customers WHERE id = $1 AND shop_id = $2`,
    [customerId, ctx.shopId],
  );
  if (!customer.rows[0]) throw notFound('Customer not found');
  const txns = await query(
    `SELECT k.id, k.type, k.amount_minor AS "amountMinor",
            k.balance_after_minor AS "balanceAfterMinor", k.method, k.note,
            u.name AS "createdByName", k.created_at AS "createdAt"
       FROM khata_transactions k
       JOIN users u ON u.id = k.created_by
      WHERE k.customer_id = $1 AND k.shop_id = $2
      ORDER BY k.created_at DESC, k.id DESC
      LIMIT 200`,
    [customerId, ctx.shopId],
  );
  return { customer: customer.rows[0], transactions: txns.rows };
}

export async function listOutstanding(ctx: Ctx, limit = 100) {
  const { rows } = await query(
    `SELECT id, name, phone, locality, balance_minor AS "balanceMinor",
            updated_at AS "updatedAt"
       FROM customers
      WHERE shop_id = $1 AND balance_minor > 0
      ORDER BY balance_minor DESC
      LIMIT $2`,
    [ctx.shopId, limit],
  );
  return { data: rows };
}
