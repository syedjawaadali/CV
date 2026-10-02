import { Router } from 'express';
import { PERMISSIONS } from '@smartdukaan/shared';
import { asyncHandler, ok } from '../../lib/http.js';
import { requirePermission } from '../../middleware/authorize.js';
import { query } from '../../db/pool.js';

/**
 * FMCG distributor directory (global reference data). Lets a retailer restock a
 * low item with one tap (call / WhatsApp). Sponsored distributors are surfaced
 * first — a monetization rail (brands pay for placement).
 */
export const distributorRouter = Router();

const SELECT =
  'id, name, name_ur AS "nameUr", category, phone, whatsapp, city, sponsored';

distributorRouter.get(
  '/',
  requirePermission(PERMISSIONS.PRODUCT_VIEW),
  asyncHandler(async (req, res) => {
    const category = typeof req.query.category === 'string' ? req.query.category : null;
    const params: unknown[] = [];
    let where = '';
    if (category) {
      params.push(category);
      where = 'WHERE lower(category) = lower($1)';
    }
    const { rows } = await query(
      `SELECT ${SELECT} FROM distributors ${where}
        ORDER BY sponsored DESC, lower(name) ASC LIMIT 100`,
      params,
    );
    ok(res, { data: rows });
  }),
);
