import { Router } from 'express';
import { createPurchaseSchema, PERMISSIONS } from '@smartdukaan/shared';
import { asyncHandler, ok, parseBody } from '../../lib/http.js';
import { requirePermission } from '../../middleware/authorize.js';
import { writeAudit } from '../../lib/audit.js';
import { createPurchase, getPurchase, listPurchases } from './purchases.service.js';

export const purchaseRouter = Router();
purchaseRouter.use(requirePermission(PERMISSIONS.PURCHASE_MANAGE));

purchaseRouter.get('/', asyncHandler(async (req, res) => {
  ok(res, await listPurchases(req.auth!));
}));

purchaseRouter.get('/:id', asyncHandler(async (req, res) => {
  ok(res, await getPurchase(req.auth!, req.params.id!));
}));

purchaseRouter.post('/', asyncHandler(async (req, res) => {
  const input = parseBody(createPurchaseSchema, req);
  const purchase = await createPurchase(req.auth!, input);
  await writeAudit({
    tenantId: req.auth!.tenantId, shopId: req.auth!.shopId, actorUserId: req.auth!.userId,
    action: 'purchase.create', resourceType: 'purchase',
    resourceId: (purchase as unknown as { id: string }).id, requestId: req.id,
  });
  ok(res, purchase, 201);
}));
