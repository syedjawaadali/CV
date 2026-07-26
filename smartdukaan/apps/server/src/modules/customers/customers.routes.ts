import { Router } from 'express';
import {
  createCustomerSchema, updateCustomerSchema, paginationSchema, PERMISSIONS,
} from '@smartdukaan/shared';
import { asyncHandler, ok, parseBody, parseQuery } from '../../lib/http.js';
import { requirePermission } from '../../middleware/authorize.js';
import { writeAudit } from '../../lib/audit.js';
import {
  createCustomer, getCustomer, listCustomers, updateCustomer,
} from './customers.service.js';

export const customerRouter = Router();

customerRouter.get(
  '/',
  requirePermission(PERMISSIONS.CUSTOMER_VIEW),
  asyncHandler(async (req, res) => {
    const q = parseQuery(paginationSchema, req);
    ok(res, await listCustomers(req.auth!, q));
  }),
);

customerRouter.get(
  '/:id',
  requirePermission(PERMISSIONS.CUSTOMER_VIEW),
  asyncHandler(async (req, res) => {
    ok(res, await getCustomer(req.auth!, req.params.id!));
  }),
);

customerRouter.post(
  '/',
  requirePermission(PERMISSIONS.CUSTOMER_MANAGE),
  asyncHandler(async (req, res) => {
    const input = parseBody(createCustomerSchema, req);
    const customer = await createCustomer(req.auth!, input);
    await writeAudit({
      tenantId: req.auth!.tenantId, shopId: req.auth!.shopId, actorUserId: req.auth!.userId,
      action: 'customer.create', resourceType: 'customer', resourceId: customer.id, requestId: req.id,
    });
    ok(res, customer, 201);
  }),
);

customerRouter.patch(
  '/:id',
  requirePermission(PERMISSIONS.CUSTOMER_MANAGE),
  asyncHandler(async (req, res) => {
    const input = parseBody(updateCustomerSchema, req);
    const customer = await updateCustomer(req.auth!, req.params.id!, input);
    await writeAudit({
      tenantId: req.auth!.tenantId, shopId: req.auth!.shopId, actorUserId: req.auth!.userId,
      action: 'customer.update', resourceType: 'customer', resourceId: req.params.id!, requestId: req.id,
    });
    ok(res, customer);
  }),
);
