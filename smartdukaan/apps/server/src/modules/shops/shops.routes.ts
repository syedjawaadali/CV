import { Router } from 'express';
import { updateShopSchema, PERMISSIONS } from '@smartdukaan/shared';
import { asyncHandler, ok, parseBody } from '../../lib/http.js';
import { requirePermission } from '../../middleware/authorize.js';
import { query } from '../../db/pool.js';
import { notFound } from '../../lib/errors.js';
import { writeAudit } from '../../lib/audit.js';

export const shopRouter = Router();

shopRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT id, name, category, address, phone, language, created_at AS "createdAt"
         FROM shops WHERE id = $1 AND tenant_id = $2`,
      [req.auth!.shopId, req.auth!.tenantId],
    );
    if (!rows[0]) throw notFound('Shop not found');
    ok(res, rows[0]);
  }),
);

shopRouter.patch(
  '/',
  requirePermission(PERMISSIONS.SHOP_MANAGE),
  asyncHandler(async (req, res) => {
    const input = parseBody(updateShopSchema, req);
    const { rows } = await query(
      `UPDATE shops SET
         name = COALESCE($1, name),
         category = COALESCE($2, category),
         address = COALESCE($3, address),
         phone = COALESCE($4, phone),
         language = COALESCE($5, language),
         updated_at = now()
       WHERE id = $6 AND tenant_id = $7
       RETURNING id, name, category, address, phone, language, created_at AS "createdAt"`,
      [
        input.name ?? null, input.category ?? null, input.address ?? null,
        input.phone ?? null, input.language ?? null,
        req.auth!.shopId, req.auth!.tenantId,
      ],
    );
    if (!rows[0]) throw notFound('Shop not found');
    await writeAudit({
      tenantId: req.auth!.tenantId, shopId: req.auth!.shopId, actorUserId: req.auth!.userId,
      action: 'shop.update', resourceType: 'shop', resourceId: req.auth!.shopId, requestId: req.id,
    });
    ok(res, rows[0]);
  }),
);
