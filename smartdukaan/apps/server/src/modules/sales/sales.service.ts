import type { PoolClient } from 'pg';
import type { Sale, CreateSaleInput } from '@smartdukaan/shared';
import { toMinor } from '@smartdukaan/shared';
import { query, withTransaction } from '../../db/pool.js';
import { badRequest, businessRule, notFound } from '../../lib/errors.js';
import { decodeCursor, encodeCursor } from '../../lib/pagination.js';

interface Ctx { tenantId: string; shopId: string; userId: string }

/** Round a paisa-per-unit price times a (possibly fractional) quantity to whole paisa. */
function lineTotalMinor(unitPriceMinor: number, quantity: number): number {
  return Math.round(unitPriceMinor * quantity);
}

async function nextReceiptNumber(tx: PoolClient, shopId: string): Promise<string> {
  const { rows } = await tx.query<{ sale_seq: string }>(
    `INSERT INTO shop_counters (shop_id, sale_seq) VALUES ($1, 1)
       ON CONFLICT (shop_id) DO UPDATE SET sale_seq = shop_counters.sale_seq + 1
     RETURNING sale_seq`,
    [shopId],
  );
  return `R-${String(rows[0]!.sale_seq).padStart(6, '0')}`;
}

/**
 * Records a sale atomically:
 *  - totals are computed on the server (never trusted from the client),
 *  - product stock is deducted with a matching inventory movement (blocked if
 *    it would go negative),
 *  - a credit sale posts a khata transaction and updates the customer balance.
 * Runs inside the caller-provided transaction (from the idempotency wrapper).
 */
export async function createSale(
  tx: PoolClient, ctx: Ctx, input: CreateSaleInput,
): Promise<Sale> {
  // Validate customer (if any) belongs to this shop.
  let customerId: string | null = input.customerId ?? null;
  if (customerId) {
    const c = await tx.query('SELECT 1 FROM customers WHERE id = $1 AND shop_id = $2', [customerId, ctx.shopId]);
    if (c.rowCount === 0) throw badRequest('Selected customer was not found');
  }
  if (input.paymentMethod === 'credit' && !customerId) {
    throw badRequest('Select a customer for a credit sale');
  }

  const items = input.items ?? [];
  const amountOnly = typeof input.amountOnly === 'number';
  const discountMinor = toMinor(input.discount ?? 0);

  interface Line { productId: string; name: string; quantity: number; unitPriceMinor: number; lineTotalMinor: number }
  const lines: Line[] = [];
  let subtotalMinor = 0;

  if (amountOnly) {
    subtotalMinor = toMinor(input.amountOnly!);
  } else {
    if (items.length === 0) throw badRequest('Add at least one product or enter a sale amount');
    for (const item of items) {
      // Lock the product row so concurrent sales cannot oversell.
      const p = await tx.query<{ id: string; name: string; stock_qty: string }>(
        'SELECT id, name, stock_qty FROM products WHERE id = $1 AND shop_id = $2 FOR UPDATE',
        [item.productId, ctx.shopId],
      );
      const product = p.rows[0];
      if (!product) throw badRequest('A selected product was not found');
      const currentStock = Number(product.stock_qty);
      if (item.quantity > currentStock) {
        throw businessRule(`Not enough stock for "${product.name}" (have ${currentStock}, need ${item.quantity})`);
      }
      const unitPriceMinor = toMinor(item.unitPrice);
      const line = lineTotalMinor(unitPriceMinor, item.quantity);
      lines.push({ productId: product.id, name: product.name, quantity: item.quantity, unitPriceMinor, lineTotalMinor: line });
      subtotalMinor += line;
    }
  }

  const totalMinor = subtotalMinor - discountMinor;
  if (totalMinor < 0) throw badRequest('Discount cannot be more than the total');

  const receiptNumber = await nextReceiptNumber(tx, ctx.shopId);

  const saleRow = await tx.query<{ id: string; created_at: Date }>(
    `INSERT INTO sales
       (tenant_id, shop_id, receipt_number, customer_id, payment_method, status,
        subtotal_minor, discount_minor, total_minor, amount_only, note, created_by)
     VALUES ($1,$2,$3,$4,$5,'completed',$6,$7,$8,$9,$10,$11)
     RETURNING id, created_at`,
    [
      ctx.tenantId, ctx.shopId, receiptNumber, customerId, input.paymentMethod,
      subtotalMinor, discountMinor, totalMinor, amountOnly, input.note ?? null, ctx.userId,
    ],
  );
  const saleId = saleRow.rows[0]!.id;

  // Line items + stock movements.
  for (const line of lines) {
    await tx.query(
      `INSERT INTO sale_items (sale_id, tenant_id, product_id, name, quantity, unit_price_minor, line_total_minor)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [saleId, ctx.tenantId, line.productId, line.name, line.quantity, line.unitPriceMinor, line.lineTotalMinor],
    );
    const updated = await tx.query<{ stock_qty: string }>(
      'UPDATE products SET stock_qty = stock_qty - $1, updated_at = now() WHERE id = $2 RETURNING stock_qty',
      [line.quantity, line.productId],
    );
    await tx.query(
      `INSERT INTO inventory_movements
         (tenant_id, shop_id, product_id, type, quantity_delta, balance_after, sale_id, created_by)
       VALUES ($1,$2,$3,'sale',$4,$5,$6,$7)`,
      [ctx.tenantId, ctx.shopId, line.productId, -line.quantity, updated.rows[0]!.stock_qty, saleId, ctx.userId],
    );
  }

  // Credit sale → khata ledger + customer balance.
  if (input.paymentMethod === 'credit' && customerId) {
    const bal = await tx.query<{ balance_minor: string }>(
      'UPDATE customers SET balance_minor = balance_minor + $1, updated_at = now() WHERE id = $2 RETURNING balance_minor',
      [totalMinor, customerId],
    );
    await tx.query(
      `INSERT INTO khata_transactions
         (tenant_id, shop_id, customer_id, type, amount_minor, balance_after_minor, sale_id, note, created_by)
       VALUES ($1,$2,$3,'credit',$4,$5,$6,$7,$8)`,
      [ctx.tenantId, ctx.shopId, customerId, totalMinor, Number(bal.rows[0]!.balance_minor),
       saleId, input.note ?? null, ctx.userId],
    );
  }

  return getSaleById((t, p) => tx.query(t, p as never[]), ctx.shopId, saleId);
}

/** Wrapper that runs createSale in its own transaction (used by seed/tests). */
export function createSaleStandalone(ctx: Ctx, input: CreateSaleInput): Promise<Sale> {
  return withTransaction((tx) => createSale(tx, ctx, input));
}

export async function reverseSale(ctx: Ctx, saleId: string): Promise<Sale> {
  return withTransaction(async (tx) => {
    const s = await tx.query<{ id: string; status: string; payment_method: string; total_minor: string; customer_id: string | null }>(
      'SELECT id, status, payment_method, total_minor, customer_id FROM sales WHERE id = $1 AND shop_id = $2 FOR UPDATE',
      [saleId, ctx.shopId],
    );
    const sale = s.rows[0];
    if (!sale) throw notFound('Sale not found');
    if (sale.status === 'reversed') throw businessRule('This sale has already been reversed');

    await tx.query(
      'UPDATE sales SET status = $1, reversed_at = now(), reversed_by = $2 WHERE id = $3',
      ['reversed', ctx.userId, saleId],
    );

    // Restore stock for each line item that references a product.
    const items = await tx.query<{ product_id: string | null; quantity: string }>(
      'SELECT product_id, quantity FROM sale_items WHERE sale_id = $1',
      [saleId],
    );
    for (const item of items.rows) {
      if (!item.product_id) continue;
      const updated = await tx.query<{ stock_qty: string }>(
        'UPDATE products SET stock_qty = stock_qty + $1, updated_at = now() WHERE id = $2 RETURNING stock_qty',
        [item.quantity, item.product_id],
      );
      await tx.query(
        `INSERT INTO inventory_movements
           (tenant_id, shop_id, product_id, type, quantity_delta, balance_after, sale_id, note, created_by)
         VALUES ($1,$2,$3,'sale_reversal',$4,$5,$6,'Sale reversed',$7)`,
        [ctx.tenantId, ctx.shopId, item.product_id, item.quantity, updated.rows[0]!.stock_qty, saleId, ctx.userId],
      );
    }

    // Reverse credit: reduce the customer balance with a reversal ledger entry.
    if (sale.payment_method === 'credit' && sale.customer_id) {
      const total = Number(sale.total_minor);
      const bal = await tx.query<{ balance_minor: string }>(
        'UPDATE customers SET balance_minor = balance_minor - $1, updated_at = now() WHERE id = $2 RETURNING balance_minor',
        [total, sale.customer_id],
      );
      await tx.query(
        `INSERT INTO khata_transactions
           (tenant_id, shop_id, customer_id, type, amount_minor, balance_after_minor, sale_id, note, created_by)
         VALUES ($1,$2,$3,'reversal',$4,$5,$6,'Sale reversed',$7)`,
        [ctx.tenantId, ctx.shopId, sale.customer_id, -total, Number(bal.rows[0]!.balance_minor), saleId, ctx.userId],
      );
    }

    return getSaleById((t, p) => tx.query(t, p as never[]), ctx.shopId, saleId);
  });
}

// --- Reads ------------------------------------------------------------------

type QueryFn = (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;

export async function getSaleById(
  run: QueryFn, shopId: string, saleId: string,
): Promise<Sale> {
  const { rows } = await run(
    `SELECT s.id, s.receipt_number AS "receiptNumber", s.customer_id AS "customerId",
            c.name AS "customerName", s.payment_method AS "paymentMethod", s.status,
            s.subtotal_minor AS "subtotalMinor", s.discount_minor AS "discountMinor",
            s.total_minor AS "totalMinor", s.amount_only AS "amountOnly", s.note,
            u.name AS "createdByName", s.created_at AS "createdAt"
       FROM sales s
       LEFT JOIN customers c ON c.id = s.customer_id
       JOIN users u ON u.id = s.created_by
      WHERE s.id = $1 AND s.shop_id = $2`,
    [saleId, shopId],
  );
  const sale = rows[0] as Sale | undefined;
  if (!sale) throw notFound('Sale not found');
  const items = await run(
    `SELECT id, product_id AS "productId", name, quantity::text AS quantity,
            unit_price_minor AS "unitPriceMinor", line_total_minor AS "lineTotalMinor"
       FROM sale_items WHERE sale_id = $1 ORDER BY id`,
    [saleId],
  );
  sale.items = items.rows as Sale['items'];
  return sale;
}

export async function getSale(ctx: Ctx, saleId: string): Promise<Sale> {
  return getSaleById((t, p) => query(t, p as never[]), ctx.shopId, saleId);
}

export async function listSales(
  ctx: Ctx, opts: { limit: number; cursor?: string; customerId?: string },
) {
  const cur = decodeCursor(opts.cursor);
  const params: unknown[] = [ctx.shopId];
  let where = 's.shop_id = $1';
  if (opts.customerId) {
    params.push(opts.customerId);
    where += ` AND s.customer_id = $${params.length}`;
  }
  if (cur) {
    params.push(cur.createdAt, cur.id);
    where += ` AND (s.created_at, s.id) < ($${params.length - 1}::timestamptz, $${params.length}::uuid)`;
  }
  params.push(opts.limit + 1);
  const { rows } = await query(
    `SELECT s.id, s.receipt_number AS "receiptNumber", s.customer_id AS "customerId",
            c.name AS "customerName", s.payment_method AS "paymentMethod", s.status,
            s.subtotal_minor AS "subtotalMinor", s.discount_minor AS "discountMinor",
            s.total_minor AS "totalMinor", s.amount_only AS "amountOnly", s.note,
            u.name AS "createdByName", s.created_at AS "createdAt"
       FROM sales s
       LEFT JOIN customers c ON c.id = s.customer_id
       JOIN users u ON u.id = s.created_by
      WHERE ${where}
      ORDER BY s.created_at DESC, s.id DESC
      LIMIT $${params.length}`,
    params,
  );
  const hasMore = rows.length > opts.limit;
  const data = hasMore ? rows.slice(0, opts.limit) : rows;
  const last = data[data.length - 1] as { createdAt: string; id: string } | undefined;
  return { data, nextCursor: hasMore && last ? encodeCursor(last.createdAt, last.id) : null };
}
