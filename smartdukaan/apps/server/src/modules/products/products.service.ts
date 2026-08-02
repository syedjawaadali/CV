import { toMinor } from '@smartdukaan/shared';
import { query, withTransaction } from '../../db/pool.js';
import { notFound } from '../../lib/errors.js';
import { decodeCursor, encodeCursor } from '../../lib/pagination.js';

interface Ctx { tenantId: string; shopId: string; userId: string }

const SELECT = `
  id, name, name_ur AS "nameUr", barcode, category, unit, image_url AS "imageUrl",
  perishable,
  cost_price_minor AS "costPriceMinor",
  selling_price_minor AS "sellingPriceMinor",
  stock_qty::text AS "stockQty",
  low_stock_threshold::text AS "lowStockThreshold",
  catalog_match_status AS "catalogMatchStatus",
  product_variant_id AS "productVariantId",
  global_product_id AS "globalProductId",
  active, created_at AS "createdAt"`;

export async function listProducts(
  ctx: Ctx,
  opts: { limit: number; cursor?: string; q?: string; lowStock?: boolean },
) {
  const cur = decodeCursor(opts.cursor);
  const params: unknown[] = [ctx.shopId];
  let where = 'shop_id = $1';
  if (opts.q) {
    params.push(`%${opts.q}%`);
    where += ` AND (name ILIKE $${params.length} OR name_ur ILIKE $${params.length} OR barcode ILIKE $${params.length})`;
  }
  if (opts.lowStock) {
    where += ' AND active AND stock_qty <= low_stock_threshold';
  }
  if (cur) {
    params.push(cur.createdAt, cur.id);
    where += ` AND (created_at, id) < ($${params.length - 1}::timestamptz, $${params.length}::uuid)`;
  }
  params.push(opts.limit + 1);
  const { rows } = await query(
    `SELECT ${SELECT} FROM products WHERE ${where}
      ORDER BY created_at DESC, id DESC LIMIT $${params.length}`,
    params,
  );
  const hasMore = rows.length > opts.limit;
  const data = hasMore ? rows.slice(0, opts.limit) : rows;
  const last = data[data.length - 1] as { createdAt: string; id: string } | undefined;
  return { data, nextCursor: hasMore && last ? encodeCursor(last.createdAt, last.id) : null };
}

export async function getProduct(ctx: Ctx, id: string) {
  const { rows } = await query(`SELECT ${SELECT} FROM products WHERE id = $1 AND shop_id = $2`, [id, ctx.shopId]);
  if (!rows[0]) throw notFound('Product not found');
  return rows[0];
}

export async function getByBarcode(ctx: Ctx, barcode: string) {
  const { rows } = await query(
    `SELECT ${SELECT} FROM products WHERE barcode = $1 AND shop_id = $2`,
    [barcode, ctx.shopId],
  );
  return rows[0] ?? null;
}

export async function createProduct(
  ctx: Ctx,
  input: {
    name: string; nameUr?: string | null; barcode?: string | null; category?: string | null;
    unit: string; imageUrl?: string | null; perishable?: boolean; costPrice: number;
    sellingPrice: number; openingStock?: number; lowStockThreshold: number;
  },
) {
  return withTransaction(async (tx) => {
    const opening = input.openingStock ?? 0;
    const created = await tx.query(
      `INSERT INTO products
         (tenant_id, shop_id, name, name_ur, barcode, category, unit, image_url, perishable,
          cost_price_minor, selling_price_minor, stock_qty, low_stock_threshold)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING ${SELECT}`,
      [
        ctx.tenantId, ctx.shopId, input.name, input.nameUr ?? null, input.barcode ?? null,
        input.category ?? null, input.unit, input.imageUrl ?? null, input.perishable ?? false,
        toMinor(input.costPrice), toMinor(input.sellingPrice),
        opening, input.lowStockThreshold,
      ],
    );
    const product = created.rows[0] as { id: string };
    if (opening > 0) {
      await tx.query(
        `INSERT INTO inventory_movements
           (tenant_id, shop_id, product_id, type, quantity_delta, balance_after, note, created_by)
         VALUES ($1,$2,$3,'opening',$4,$4,'Opening stock',$5)`,
        [ctx.tenantId, ctx.shopId, product.id, opening, ctx.userId],
      );
    }
    return created.rows[0]!;
  });
}

export async function updateProduct(
  ctx: Ctx, id: string,
  input: {
    name?: string; nameUr?: string | null; barcode?: string | null; category?: string | null;
    unit?: string; imageUrl?: string | null; perishable?: boolean; costPrice?: number;
    sellingPrice?: number; lowStockThreshold?: number;
  },
) {
  const { rows } = await query(
    `UPDATE products SET
       name = COALESCE($1, name),
       name_ur = COALESCE($2, name_ur),
       barcode = COALESCE($3, barcode),
       category = COALESCE($4, category),
       unit = COALESCE($5, unit),
       image_url = COALESCE($6, image_url),
       perishable = COALESCE($7, perishable),
       cost_price_minor = COALESCE($8, cost_price_minor),
       selling_price_minor = COALESCE($9, selling_price_minor),
       low_stock_threshold = COALESCE($10, low_stock_threshold),
       updated_at = now()
     WHERE id = $11 AND shop_id = $12
     RETURNING ${SELECT}`,
    [
      input.name ?? null, input.nameUr ?? null, input.barcode ?? null, input.category ?? null,
      input.unit ?? null, input.imageUrl ?? null,
      input.perishable ?? null,
      input.costPrice != null ? toMinor(input.costPrice) : null,
      input.sellingPrice != null ? toMinor(input.sellingPrice) : null,
      input.lowStockThreshold ?? null,
      id, ctx.shopId,
    ],
  );
  if (!rows[0]) throw notFound('Product not found');
  return rows[0];
}
