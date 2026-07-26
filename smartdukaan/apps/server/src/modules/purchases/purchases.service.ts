import { toMinor } from '@smartdukaan/shared';
import { query, withTransaction } from '../../db/pool.js';
import { badRequest, notFound } from '../../lib/errors.js';

interface Ctx { tenantId: string; shopId: string; userId: string }

export async function createPurchase(
  ctx: Ctx,
  input: {
    supplierId?: string | null;
    items: { productId: string; quantity: number; unitCost: number }[];
    note?: string | null;
  },
) {
  return withTransaction(async (tx) => {
    if (input.supplierId) {
      const s = await tx.query('SELECT 1 FROM suppliers WHERE id = $1 AND shop_id = $2', [input.supplierId, ctx.shopId]);
      if (s.rowCount === 0) throw badRequest('Selected supplier was not found');
    }

    let totalMinor = 0;
    interface Line { productId: string; quantity: number; unitCostMinor: number; lineTotalMinor: number }
    const lines: Line[] = [];
    for (const item of input.items) {
      const p = await tx.query('SELECT 1 FROM products WHERE id = $1 AND shop_id = $2', [item.productId, ctx.shopId]);
      if (p.rowCount === 0) throw badRequest('A selected product was not found');
      const unitCostMinor = toMinor(item.unitCost);
      const lineTotal = Math.round(unitCostMinor * item.quantity);
      lines.push({ productId: item.productId, quantity: item.quantity, unitCostMinor, lineTotalMinor: lineTotal });
      totalMinor += lineTotal;
    }

    const purchase = await tx.query<{ id: string }>(
      `INSERT INTO purchases (tenant_id, shop_id, supplier_id, total_minor, note, created_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [ctx.tenantId, ctx.shopId, input.supplierId ?? null, totalMinor, input.note ?? null, ctx.userId],
    );
    const purchaseId = purchase.rows[0]!.id;

    for (const line of lines) {
      await tx.query(
        `INSERT INTO purchase_items (purchase_id, tenant_id, product_id, quantity, unit_cost_minor, line_total_minor)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [purchaseId, ctx.tenantId, line.productId, line.quantity, line.unitCostMinor, line.lineTotalMinor],
      );
      const updated = await tx.query<{ stock_qty: string }>(
        `UPDATE products SET stock_qty = stock_qty + $1, cost_price_minor = $2, updated_at = now()
          WHERE id = $3 RETURNING stock_qty`,
        [line.quantity, line.unitCostMinor, line.productId],
      );
      await tx.query(
        `INSERT INTO inventory_movements
           (tenant_id, shop_id, product_id, type, quantity_delta, balance_after, purchase_id, note, created_by)
         VALUES ($1,$2,$3,'purchase',$4,$5,$6,'Purchase received',$7)`,
        [ctx.tenantId, ctx.shopId, line.productId, line.quantity, updated.rows[0]!.stock_qty, purchaseId, ctx.userId],
      );
    }

    return getPurchase(ctx, purchaseId);
  });
}

export async function getPurchase(ctx: Ctx, id: string) {
  const { rows } = await query(
    `SELECT p.id, p.supplier_id AS "supplierId", s.name AS "supplierName",
            p.total_minor AS "totalMinor", p.note, u.name AS "createdByName",
            p.created_at AS "createdAt"
       FROM purchases p
       LEFT JOIN suppliers s ON s.id = p.supplier_id
       JOIN users u ON u.id = p.created_by
      WHERE p.id = $1 AND p.shop_id = $2`,
    [id, ctx.shopId],
  );
  if (!rows[0]) throw notFound('Purchase not found');
  const items = await query(
    `SELECT pi.id, pi.product_id AS "productId", pr.name,
            pi.quantity::text AS quantity, pi.unit_cost_minor AS "unitCostMinor",
            pi.line_total_minor AS "lineTotalMinor"
       FROM purchase_items pi JOIN products pr ON pr.id = pi.product_id
      WHERE pi.purchase_id = $1 ORDER BY pi.id`,
    [id],
  );
  return { ...rows[0], items: items.rows };
}

export async function listPurchases(ctx: Ctx, limit = 50) {
  const { rows } = await query(
    `SELECT p.id, p.supplier_id AS "supplierId", s.name AS "supplierName",
            p.total_minor AS "totalMinor", p.note, u.name AS "createdByName",
            p.created_at AS "createdAt"
       FROM purchases p
       LEFT JOIN suppliers s ON s.id = p.supplier_id
       JOIN users u ON u.id = p.created_by
      WHERE p.shop_id = $1
      ORDER BY p.created_at DESC LIMIT $2`,
    [ctx.shopId, limit],
  );
  return { data: rows };
}
