import { Router } from 'express';
import { z } from 'zod';
import { createSaleSchema, paginationSchema, PERMISSIONS } from '@smartdukaan/shared';
import { asyncHandler, ok, parseBody, parseQuery } from '../../lib/http.js';
import { requirePermission } from '../../middleware/authorize.js';
import { runIdempotent } from '../../lib/idempotency.js';
import { writeAudit } from '../../lib/audit.js';
import { createSale, getSale, listSales, reverseSale } from './sales.service.js';

export const saleRouter = Router();

const listQuery = paginationSchema.extend({ customerId: z.string().uuid().optional() });

saleRouter.get(
  '/',
  requirePermission(PERMISSIONS.SALE_VIEW),
  asyncHandler(async (req, res) => {
    const q = parseQuery(listQuery, req);
    ok(res, await listSales(req.auth!, q));
  }),
);

saleRouter.get(
  '/:id',
  requirePermission(PERMISSIONS.SALE_VIEW),
  asyncHandler(async (req, res) => {
    ok(res, await getSale(req.auth!, req.params.id!));
  }),
);

saleRouter.post(
  '/',
  requirePermission(PERMISSIONS.SALE_CREATE),
  asyncHandler(async (req, res) => {
    const input = parseBody(createSaleSchema, req);
    const result = await runIdempotent(req, async (tx) => {
      const sale = await createSale(tx, req.auth!, input);
      return { status: 201, body: sale };
    });
    if (!result.replayed) {
      await writeAudit({
        tenantId: req.auth!.tenantId, shopId: req.auth!.shopId, actorUserId: req.auth!.userId,
        action: 'sale.create', resourceType: 'sale', resourceId: result.body.id, requestId: req.id,
        metadata: { totalMinor: result.body.totalMinor, method: result.body.paymentMethod },
      });
    }
    ok(res, result.body, result.status);
  }),
);

saleRouter.post(
  '/:id/reverse',
  requirePermission(PERMISSIONS.SALE_REVERSE),
  asyncHandler(async (req, res) => {
    const sale = await reverseSale(req.auth!, req.params.id!);
    await writeAudit({
      tenantId: req.auth!.tenantId, shopId: req.auth!.shopId, actorUserId: req.auth!.userId,
      action: 'sale.reverse', resourceType: 'sale', resourceId: req.params.id!, requestId: req.id,
    });
    ok(res, sale);
  }),
);
