import { Router } from 'express';
import { createSupplierSchema, PERMISSIONS } from '@smartdukaan/shared';
import { asyncHandler, ok, parseBody } from '../../lib/http.js';
import { requirePermission } from '../../middleware/authorize.js';
import { query } from '../../db/pool.js';
import { writeAudit } from '../../lib/audit.js';

export const supplierRouter = Router();
supplierRouter.use(requirePermission(PERMISSIONS.SUPPLIER_MANAGE));

const SELECT = 'id, name, phone, note, created_at AS "createdAt"';

supplierRouter.get('/', asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT ${SELECT} FROM suppliers WHERE shop_id = $1 ORDER BY lower(name) ASC LIMIT 200`,
    [req.auth!.shopId],
  );
  ok(res, { data: rows });
}));

supplierRouter.post('/', asyncHandler(async (req, res) => {
  const input = parseBody(createSupplierSchema, req);
  const { rows } = await query(
    `INSERT INTO suppliers (tenant_id, shop_id, name, phone, note)
     VALUES ($1,$2,$3,$4,$5) RETURNING ${SELECT}`,
    [req.auth!.tenantId, req.auth!.shopId, input.name, input.phone ?? null, input.note ?? null],
  );
  await writeAudit({
    tenantId: req.auth!.tenantId, shopId: req.auth!.shopId, actorUserId: req.auth!.userId,
    action: 'supplier.create', resourceType: 'supplier',
    resourceId: (rows[0] as { id: string }).id, requestId: req.id,
  });
  ok(res, rows[0], 201);
}));
