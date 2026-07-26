import { Router } from 'express';
import { z } from 'zod';
import { PERMISSIONS } from '@smartdukaan/shared';
import { asyncHandler, ok, parseBody } from '../../lib/http.js';
import { requirePermission } from '../../middleware/authorize.js';
import { notFound } from '../../lib/errors.js';
import { query } from '../../db/pool.js';

/**
 * Crowd-sourced barcode catalog — the network-effect moat.
 *
 * Pakistani barcodes carry no product detail and no public database maps them.
 * So we build our own: GET looks a barcode up in the SHARED catalog; POST lets
 * the first retailer who scans an unknown barcode name it once, after which
 * every other shop that scans it gets an instant auto-fill. The catalog is
 * global (not tenant-scoped) on purpose — that shared knowledge is the moat.
 */
export const catalogRouter = Router();

const SELECT =
  'barcode, name, name_ur AS "nameUr", category, default_unit AS "defaultUnit", image_url AS "imageUrl", contributions';

catalogRouter.get(
  '/:barcode',
  requirePermission(PERMISSIONS.PRODUCT_VIEW),
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT ${SELECT} FROM global_catalog WHERE barcode = $1`,
      [req.params.barcode!],
    );
    if (!rows[0]) throw notFound('This barcode is not in the shared catalog yet');
    ok(res, rows[0]);
  }),
);

const contributeSchema = z.object({
  barcode: z.string().trim().min(3, 'Barcode is too short').max(64),
  name: z.string().trim().min(1, 'Enter a product name').max(160),
  nameUr: z.string().trim().max(160).nullable().optional(),
  category: z.string().trim().max(80).nullable().optional(),
  unit: z.string().trim().max(24).optional(),
});

catalogRouter.post(
  '/',
  requirePermission(PERMISSIONS.PRODUCT_MANAGE),
  asyncHandler(async (req, res) => {
    const input = parseBody(contributeSchema, req);
    // First namer wins on text fields; every contribution bumps the counter.
    const { rows } = await query(
      `INSERT INTO global_catalog (barcode, name, name_ur, category, default_unit)
       VALUES ($1, $2, $3, $4, COALESCE($5, 'piece'))
       ON CONFLICT (barcode) DO UPDATE SET
         name = COALESCE(global_catalog.name, EXCLUDED.name),
         name_ur = COALESCE(global_catalog.name_ur, EXCLUDED.name_ur),
         category = COALESCE(global_catalog.category, EXCLUDED.category),
         contributions = global_catalog.contributions + 1,
         updated_at = now()
       RETURNING ${SELECT}`,
      [input.barcode, input.name, input.nameUr ?? null, input.category ?? null, input.unit ?? null],
    );
    ok(res, rows[0], 201);
  }),
);
