import { Router } from 'express';
import { khataCreditSchema, khataPaymentSchema, PERMISSIONS } from '@smartdukaan/shared';
import { asyncHandler, ok, parseBody } from '../../lib/http.js';
import { requirePermission } from '../../middleware/authorize.js';
import { writeAudit } from '../../lib/audit.js';
import { addCredit, getStatement, listOutstanding, recordPayment } from './khata.service.js';

export const khataRouter = Router();

khataRouter.get(
  '/outstanding',
  requirePermission(PERMISSIONS.KHATA_VIEW),
  asyncHandler(async (req, res) => {
    ok(res, await listOutstanding(req.auth!));
  }),
);

khataRouter.get(
  '/:customerId',
  requirePermission(PERMISSIONS.KHATA_VIEW),
  asyncHandler(async (req, res) => {
    ok(res, await getStatement(req.auth!, req.params.customerId!));
  }),
);

khataRouter.post(
  '/credit',
  requirePermission(PERMISSIONS.KHATA_MANAGE),
  asyncHandler(async (req, res) => {
    const input = parseBody(khataCreditSchema, req);
    const result = await addCredit(req.auth!, input);
    await writeAudit({
      tenantId: req.auth!.tenantId, shopId: req.auth!.shopId, actorUserId: req.auth!.userId,
      action: 'khata.credit', resourceType: 'customer', resourceId: input.customerId, requestId: req.id,
    });
    ok(res, result, 201);
  }),
);

khataRouter.post(
  '/payment',
  requirePermission(PERMISSIONS.KHATA_MANAGE),
  asyncHandler(async (req, res) => {
    const input = parseBody(khataPaymentSchema, req);
    const result = await recordPayment(req.auth!, input);
    await writeAudit({
      tenantId: req.auth!.tenantId, shopId: req.auth!.shopId, actorUserId: req.auth!.userId,
      action: 'khata.payment', resourceType: 'customer', resourceId: input.customerId, requestId: req.id,
    });
    ok(res, result, 201);
  }),
);
