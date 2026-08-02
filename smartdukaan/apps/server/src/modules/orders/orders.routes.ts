import { Router } from 'express';
import { z } from 'zod';
import { PERMISSIONS } from '@smartdukaan/shared';
import { asyncHandler, ok, parseBody } from '../../lib/http.js';
import { requirePermission } from '../../middleware/authorize.js';
import { notFound } from '../../lib/errors.js';
import { query } from '../../db/pool.js';
import { writeAudit } from '../../lib/audit.js';
import { expireOverdueOrders } from '../../lib/orders.js';

/**
 * Retailer-facing order management for the online storefront. Staff see
 * incoming orders and move them through the pipeline.
 */
export const orderRouter = Router();

const ORDER_SELECT = `
  o.id, o.status, o.customer_name AS "customerName", o.customer_phone AS "customerPhone",
  o.subtotal_minor AS "subtotalMinor", o.advance_minor AS "advanceMinor",
  o.advance_rate::float AS "advanceRate", o.advance_paid AS "advancePaid",
  o.has_perishable AS "hasPerishable", o.pickup_by AS "pickupBy",
  ca.no_show_count AS "customerNoShowCount",
  o.note, o.created_at AS "createdAt"`;

async function attachItems(orders: Array<{ id: string }>) {
  const ids = orders.map((o) => o.id);
  if (ids.length === 0) return orders;
  const { rows } = await query(
    `SELECT order_id AS "orderId", id, name, quantity::text AS "quantity",
            unit_price_minor AS "unitPriceMinor", line_total_minor AS "lineTotalMinor"
       FROM order_items WHERE order_id = ANY($1::uuid[])`,
    [ids],
  );
  const map = new Map<string, unknown[]>();
  for (const r of rows as Array<{ orderId: string }>) {
    const list = map.get(r.orderId) ?? [];
    list.push(r);
    map.set(r.orderId, list);
  }
  return orders.map((o) => ({ ...o, items: map.get(o.id) ?? [] }));
}

orderRouter.get(
  '/',
  requirePermission(PERMISSIONS.SALE_VIEW),
  asyncHandler(async (req, res) => {
    await expireOverdueOrders({ shopId: req.auth!.shopId });
    const { rows } = await query(
      `SELECT ${ORDER_SELECT} FROM orders o
         JOIN customer_accounts ca ON ca.id = o.customer_account_id
        WHERE o.shop_id = $1 ORDER BY o.created_at DESC LIMIT 100`,
      [req.auth!.shopId],
    );
    ok(res, { data: await attachItems(rows as Array<{ id: string }>) });
  }),
);

const statusSchema = z.object({
  status: z.enum(['accepted', 'ready', 'fulfilled', 'rejected', 'cancelled']),
});

orderRouter.patch(
  '/:id/status',
  requirePermission(PERMISSIONS.SALE_CREATE),
  asyncHandler(async (req, res) => {
    const { status } = parseBody(statusSchema, req);
    const { rows } = await query<{ id: string }>(
      `UPDATE orders SET status = $1, updated_at = now()
        WHERE id = $2 AND shop_id = $3 RETURNING id`,
      [status, req.params.id!, req.auth!.shopId],
    );
    if (!rows[0]) throw notFound('Order not found');
    await writeAudit({
      tenantId: req.auth!.tenantId, shopId: req.auth!.shopId, actorUserId: req.auth!.userId,
      action: `order.${status}`, resourceType: 'order', resourceId: req.params.id!, requestId: req.id,
    });
    ok(res, { id: rows[0].id, status });
  }),
);
