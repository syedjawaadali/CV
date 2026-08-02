import { Router } from 'express';
import { z } from 'zod';
import {
  createProductSchema, updateProductSchema, paginationSchema, PERMISSIONS,
} from '@smartdukaan/shared';
import { asyncHandler, ok, parseBody, parseQuery } from '../../lib/http.js';
import { requirePermission } from '../../middleware/authorize.js';
import { notFound } from '../../lib/errors.js';
import { writeAudit } from '../../lib/audit.js';
import {
  createProduct, getByBarcode, getProduct, listProducts, updateProduct,
} from './products.service.js';

export const productRouter = Router();

const listQuery = paginationSchema.extend({
  lowStock: z.coerce.boolean().optional(),
});

productRouter.get(
  '/',
  requirePermission(PERMISSIONS.PRODUCT_VIEW),
  asyncHandler(async (req, res) => {
    const q = parseQuery(listQuery, req);
    ok(res, await listProducts(req.auth!, q));
  }),
);

productRouter.get(
  '/barcode/:code',
  requirePermission(PERMISSIONS.PRODUCT_VIEW),
  asyncHandler(async (req, res) => {
    const product = await getByBarcode(req.auth!, req.params.code!);
    if (!product) throw notFound('No product found for this barcode');
    ok(res, product);
  }),
);

productRouter.get(
  '/:id',
  requirePermission(PERMISSIONS.PRODUCT_VIEW),
  asyncHandler(async (req, res) => {
    ok(res, await getProduct(req.auth!, req.params.id!));
  }),
);

productRouter.post(
  '/',
  requirePermission(PERMISSIONS.PRODUCT_MANAGE),
  asyncHandler(async (req, res) => {
    const input = parseBody(createProductSchema, req);
    const product = await createProduct(req.auth!, input);
    await writeAudit({
      tenantId: req.auth!.tenantId, shopId: req.auth!.shopId, actorUserId: req.auth!.userId,
      action: 'product.create', resourceType: 'product',
      resourceId: (product as { id: string }).id, requestId: req.id,
    });
    ok(res, product, 201);
  }),
);

productRouter.patch(
  '/:id',
  requirePermission(PERMISSIONS.PRODUCT_MANAGE),
  asyncHandler(async (req, res) => {
    const input = parseBody(updateProductSchema, req);
    const product = await updateProduct(req.auth!, req.params.id!, input);
    await writeAudit({
      tenantId: req.auth!.tenantId, shopId: req.auth!.shopId, actorUserId: req.auth!.userId,
      action: 'product.update', resourceType: 'product', resourceId: req.params.id!, requestId: req.id,
    });
    ok(res, product);
  }),
);
