import { Router } from 'express';
import { stockAdjustmentSchema, PERMISSIONS } from '@smartdukaan/shared';
import { asyncHandler, ok, parseBody } from '../../lib/http.js';
import { requirePermission } from '../../middleware/authorize.js';
import { writeAudit } from '../../lib/audit.js';
import { adjustStock, getMovements, listLowStock } from './inventory.service.js';

export const inventoryRouter = Router();

inventoryRouter.get(
  '/low-stock',
  requirePermission(PERMISSIONS.INVENTORY_VIEW),
  asyncHandler(async (req, res) => {
    ok(res, await listLowStock(req.auth!));
  }),
);

inventoryRouter.get(
  '/:productId/movements',
  requirePermission(PERMISSIONS.INVENTORY_VIEW),
  asyncHandler(async (req, res) => {
    ok(res, await getMovements(req.auth!, req.params.productId!));
  }),
);

inventoryRouter.post(
  '/adjust',
  requirePermission(PERMISSIONS.INVENTORY_MANAGE),
  asyncHandler(async (req, res) => {
    const input = parseBody(stockAdjustmentSchema, req);
    const movement = await adjustStock(req.auth!, input);
    await writeAudit({
      tenantId: req.auth!.tenantId, shopId: req.auth!.shopId, actorUserId: req.auth!.userId,
      action: 'inventory.adjust', resourceType: 'product', resourceId: input.productId, requestId: req.id,
      metadata: { quantityDelta: input.quantityDelta, reason: input.reason },
    });
    ok(res, movement, 201);
  }),
);
