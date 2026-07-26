import { query, withTransaction } from '../../db/pool.js';
import { businessRule, notFound } from '../../lib/errors.js';

interface Ctx { tenantId: string; shopId: string; userId: string }

export async function adjustStock(
  ctx: Ctx,
  input: { productId: string; quantityDelta: number; reason: string; note?: string | null },
) {
  return withTransaction(async (tx) => {
    const p = await tx.query<{ id: string; name: string; stock_qty: string }>(
      'SELECT id, name, stock_qty FROM products WHERE id = $1 AND shop_id = $2 FOR UPDATE',
      [input.productId, ctx.shopId],
    );
    const product = p.rows[0];
    if (!product) throw notFound('Product not found');
    const newBalance = Number(product.stock_qty) + input.quantityDelta;
    if (newBalance < 0) {
      throw businessRule(`Adjustment would make "${product.name}" stock negative (${newBalance})`);
    }
    await tx.query(
      'UPDATE products SET stock_qty = $1, updated_at = now() WHERE id = $2',
      [newBalance, input.productId],
    );
    const { rows } = await tx.query(
      `INSERT INTO inventory_movements
         (tenant_id, shop_id, product_id, type, quantity_delta, balance_after, reason, note, created_by)
       VALUES ($1,$2,$3,'adjustment',$4,$5,$6,$7,$8)
       RETURNING id, type, quantity_delta::text AS "quantityDelta",
                 balance_after::text AS "balanceAfter", reason, note, created_at AS "createdAt"`,
      [ctx.tenantId, ctx.shopId, input.productId, input.quantityDelta, newBalance, input.reason, input.note ?? null, ctx.userId],
    );
    return rows[0];
  });
}

export async function getMovements(ctx: Ctx, productId: string, limit = 100) {
  const product = await query(
    `SELECT id, name, name_ur AS "nameUr", stock_qty::text AS "stockQty",
            low_stock_threshold::text AS "lowStockThreshold", unit
       FROM products WHERE id = $1 AND shop_id = $2`,
    [productId, ctx.shopId],
  );
  if (!product.rows[0]) throw notFound('Product not found');
  const movements = await query(
    `SELECT m.id, m.type, m.quantity_delta::text AS "quantityDelta",
            m.balance_after::text AS "balanceAfter", m.reason, m.note,
            m.created_at AS "createdAt"
       FROM inventory_movements m
      WHERE m.product_id = $1 AND m.shop_id = $2
      ORDER BY m.created_at DESC, m.id DESC
      LIMIT $3`,
    [productId, ctx.shopId, limit],
  );
  return { product: product.rows[0], movements: movements.rows };
}

export async function listLowStock(ctx: Ctx, limit = 100) {
  const { rows } = await query(
    `SELECT id, name, name_ur AS "nameUr", unit,
            stock_qty::text AS "stockQty",
            low_stock_threshold::text AS "lowStockThreshold"
       FROM products
      WHERE shop_id = $1 AND active AND stock_qty <= low_stock_threshold
      ORDER BY stock_qty ASC
      LIMIT $2`,
    [ctx.shopId, limit],
  );
  return { data: rows };
}
