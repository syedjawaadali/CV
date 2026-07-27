import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, ok, parseBody } from '../../lib/http.js';
import { badRequest, conflict, notFound, businessRule } from '../../lib/errors.js';
import { query, withTransaction } from '../../db/pool.js';
import { hashPassword, verifyPassword } from '../../lib/password.js';
import { signCustomerToken } from '../../lib/jwt.js';
import { requireCustomer } from '../../middleware/customerAuth.js';

/**
 * Buyer-facing storefront API (foodpanda-style). Customers register with a
 * phone + password, browse a shop, and place an advance order. A 30% advance
 * confirms it — payment is SIMULATED for now (no gateway).
 */
export const storeRouter = Router();

const ADVANCE_RATE = 0.3;

/* ------------------------------------------------------------------- auth */

const phone = z.string().trim().regex(/^(\+92|0)?3\d{9}$/u, 'Enter a valid Pakistani mobile number');

const registerSchema = z.object({
  phone,
  name: z.string().trim().min(2, 'Enter your name').max(120),
  password: z.string().min(6, 'Password must be at least 6 characters').max(200),
});
const loginSchema = z.object({
  phone,
  password: z.string().min(1, 'Enter your password'),
});

function publicCustomer(c: { id: string; name: string; phone: string }) {
  return { id: c.id, name: c.name, phone: c.phone };
}

storeRouter.post('/auth/register', asyncHandler(async (req, res) => {
  const input = parseBody(registerSchema, req);
  const existing = await query('SELECT 1 FROM customer_accounts WHERE phone = $1', [input.phone]);
  if (existing.rows[0]) throw conflict('An account with this phone number already exists');
  const passwordHash = await hashPassword(input.password);
  const { rows } = await query<{ id: string; name: string; phone: string }>(
    `INSERT INTO customer_accounts (phone, name, password_hash)
     VALUES ($1, $2, $3) RETURNING id, name, phone`,
    [input.phone, input.name, passwordHash],
  );
  const customer = rows[0]!;
  ok(res, { token: signCustomerToken(customer.id), customer: publicCustomer(customer) }, 201);
}));

storeRouter.post('/auth/login', asyncHandler(async (req, res) => {
  const input = parseBody(loginSchema, req);
  const { rows } = await query<{ id: string; name: string; phone: string; password_hash: string }>(
    'SELECT id, name, phone, password_hash FROM customer_accounts WHERE phone = $1',
    [input.phone],
  );
  const c = rows[0];
  if (!c || !(await verifyPassword(input.password, c.password_hash))) {
    throw badRequest('Incorrect phone number or password');
  }
  ok(res, { token: signCustomerToken(c.id), customer: publicCustomer(c) });
}));

storeRouter.get('/auth/me', requireCustomer, asyncHandler(async (req, res) => {
  ok(res, { customer: req.customer });
}));

/* ------------------------------------------------------- public storefront */

storeRouter.get('/shops', asyncHandler(async (_req, res) => {
  const { rows } = await query(
    `SELECT id, name, category, address, phone FROM shops ORDER BY lower(name) ASC LIMIT 100`,
  );
  ok(res, { data: rows });
}));

storeRouter.get('/shops/:shopId/products', asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT id, name, name_ur AS "nameUr", category, unit, image_url AS "imageUrl",
            selling_price_minor AS "sellingPriceMinor", stock_qty::text AS "stockQty"
       FROM products
      WHERE shop_id = $1 AND active
      ORDER BY lower(name) ASC LIMIT 500`,
    [req.params.shopId!],
  );
  ok(res, { data: rows });
}));

/* --------------------------------------------------------------- ordering */

const orderSchema = z.object({
  shopId: z.string().uuid(),
  items: z.array(z.object({
    productId: z.string().uuid(),
    quantity: z.number().positive().max(1_000_000),
  })).min(1, 'Add at least one item'),
  note: z.string().trim().max(400).nullable().optional(),
});

interface OrderItemRow {
  id: string; product_id: string | null; name: string;
  quantity: string; unit_price_minor: number; line_total_minor: number;
}

async function loadItems(orderIds: string[]): Promise<Map<string, unknown[]>> {
  const map = new Map<string, unknown[]>();
  if (orderIds.length === 0) return map;
  const { rows } = await query<OrderItemRow & { order_id: string }>(
    `SELECT order_id, id, product_id AS "productId", name, quantity::text AS "quantity",
            unit_price_minor AS "unitPriceMinor", line_total_minor AS "lineTotalMinor"
       FROM order_items WHERE order_id = ANY($1::uuid[])`,
    [orderIds],
  );
  for (const r of rows as unknown as Array<{ order_id: string }>) {
    const list = map.get(r.order_id) ?? [];
    list.push(r);
    map.set(r.order_id, list);
  }
  return map;
}

const ORDER_SELECT = `
  o.id, o.shop_id AS "shopId", s.name AS "shopName",
  o.customer_account_id AS "customerAccountId", o.customer_name AS "customerName",
  o.customer_phone AS "customerPhone", o.status,
  o.subtotal_minor AS "subtotalMinor", o.advance_minor AS "advanceMinor",
  o.advance_paid AS "advancePaid", o.note, o.created_at AS "createdAt"`;

async function orderWithItems(id: string) {
  const { rows } = await query(
    `SELECT ${ORDER_SELECT} FROM orders o JOIN shops s ON s.id = o.shop_id WHERE o.id = $1`,
    [id],
  );
  const order = rows[0] as (Record<string, unknown> & { id: string }) | undefined;
  if (!order) return null;
  const items = (await loadItems([id])).get(id) ?? [];
  return { ...order, items };
}

storeRouter.post('/orders', requireCustomer, asyncHandler(async (req, res) => {
  const input = parseBody(orderSchema, req);
  const order = await withTransaction(async (tx) => {
    // Price every line from the server's product record — never trust the client.
    const ids = input.items.map((i) => i.productId);
    const { rows: prods } = await tx.query<{ id: string; name: string; selling_price_minor: number }>(
      `SELECT id, name, selling_price_minor FROM products
        WHERE shop_id = $1 AND id = ANY($2::uuid[]) AND active`,
      [input.shopId, ids],
    );
    const byId = new Map(prods.map((p) => [p.id, p]));
    if (byId.size === 0) throw businessRule('None of these items are available at this shop');

    let subtotal = 0;
    const lines = input.items
      .filter((i) => byId.has(i.productId))
      .map((i) => {
        const p = byId.get(i.productId)!;
        const lineTotal = Math.round(p.selling_price_minor * i.quantity);
        subtotal += lineTotal;
        return { productId: p.id, name: p.name, quantity: i.quantity, unitPrice: p.selling_price_minor, lineTotal };
      });
    const advance = Math.round(subtotal * ADVANCE_RATE);

    const { rows: created } = await tx.query<{ id: string }>(
      `INSERT INTO orders
         (shop_id, customer_account_id, customer_name, customer_phone, status,
          subtotal_minor, advance_minor, note)
       VALUES ($1,$2,$3,$4,'pending_payment',$5,$6,$7) RETURNING id`,
      [input.shopId, req.customer!.id, req.customer!.name, req.customer!.phone, subtotal, advance, input.note ?? null],
    );
    const orderId = created[0]!.id;
    for (const l of lines) {
      await tx.query(
        `INSERT INTO order_items (order_id, product_id, name, quantity, unit_price_minor, line_total_minor)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [orderId, l.productId, l.name, l.quantity, l.unitPrice, l.lineTotal],
      );
    }
    return orderId;
  });
  ok(res, await orderWithItems(order), 201);
}));

// Simulated 30% advance — flips advance_paid and confirms the order. A real
// gateway (JazzCash/Easypaisa/Stripe) would authorize the charge here.
storeRouter.post('/orders/:id/pay-advance', requireCustomer, asyncHandler(async (req, res) => {
  const { rows } = await query<{ status: string }>(
    'SELECT status FROM orders WHERE id = $1 AND customer_account_id = $2',
    [req.params.id!, req.customer!.id],
  );
  const found = rows[0];
  if (!found) throw notFound('Order not found');
  if (found.status !== 'pending_payment') throw businessRule('This order is already confirmed');
  await query(
    `UPDATE orders SET status = 'confirmed', advance_paid = TRUE, advance_paid_at = now(), updated_at = now()
      WHERE id = $1`,
    [req.params.id!],
  );
  ok(res, await orderWithItems(req.params.id!));
}));

storeRouter.get('/orders', requireCustomer, asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT ${ORDER_SELECT} FROM orders o JOIN shops s ON s.id = o.shop_id
      WHERE o.customer_account_id = $1 ORDER BY o.created_at DESC LIMIT 100`,
    [req.customer!.id],
  );
  const ids = (rows as Array<{ id: string }>).map((r) => r.id);
  const itemsMap = await loadItems(ids);
  ok(res, { data: rows.map((o) => ({ ...(o as object), items: itemsMap.get((o as { id: string }).id) ?? [] })) });
}));
