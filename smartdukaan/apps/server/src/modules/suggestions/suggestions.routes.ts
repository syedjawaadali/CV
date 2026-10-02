import { Router } from 'express';
import { PERMISSIONS } from '@smartdukaan/shared';
import { asyncHandler, ok } from '../../lib/http.js';
import { requirePermission } from '../../middleware/authorize.js';
import { query } from '../../db/pool.js';

/**
 * Smart suggestions — the intelligence + revenue layer.
 *  - reorder:    products at/below their low-stock threshold, worst first.
 *  - topCategory: the shop's best-selling category (drives targeting).
 *  - sponsored:  one active FMCG item, preferring the shop's top category.
 *                This is the paid "smart suggestion" slot brands pay to occupy.
 */
export const suggestionRouter = Router();

suggestionRouter.get(
  '/',
  requirePermission(PERMISSIONS.PRODUCT_VIEW),
  asyncHandler(async (req, res) => {
    const shopId = req.auth!.shopId;

    const reorder = await query(
      `SELECT id, name, name_ur AS "nameUr", category, unit,
              stock_qty::text AS "stockQty",
              low_stock_threshold::text AS "lowStockThreshold",
              image_url AS "imageUrl"
         FROM products
        WHERE shop_id = $1 AND active AND stock_qty <= low_stock_threshold
        ORDER BY (low_stock_threshold - stock_qty) DESC, lower(name) ASC
        LIMIT 20`,
      [shopId],
    );

    const topCat = await query<{ category: string | null }>(
      `SELECT p.category
         FROM sale_items si JOIN products p ON p.id = si.product_id
        WHERE p.shop_id = $1 AND si.product_id IS NOT NULL AND p.category IS NOT NULL
        GROUP BY p.category
        ORDER BY COUNT(*) DESC
        LIMIT 1`,
      [shopId],
    );
    const category = topCat.rows[0]?.category ?? null;

    const sponsored = await query(
      `SELECT id, brand, name, name_ur AS "nameUr", category,
              message, message_ur AS "messageUr", image_url AS "imageUrl"
         FROM sponsored_items
        WHERE active
        ORDER BY (lower(category) = lower($1)) DESC, created_at DESC
        LIMIT 1`,
      [category ?? ''],
    );

    ok(res, {
      topCategory: category,
      reorder: reorder.rows,
      sponsored: sponsored.rows[0] ?? null,
    });
  }),
);
