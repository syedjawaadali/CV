import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { PERMISSIONS } from '@smartdukaan/shared';
import { asyncHandler, ok, parseBody, parseQuery } from '../../lib/http.js';
import { requirePermission } from '../../middleware/authorize.js';
import { notFound, businessRule } from '../../lib/errors.js';
import { writeAudit } from '../../lib/audit.js';
import { query } from '../../db/pool.js';
import { features, type FeatureName } from '../../config/features.js';
import { lookupBarcode } from './barcodeLookup.service.js';
import { recognize } from './recognition.service.js';
import {
  searchCatalog, getVariantDetail, linkProduct, unlinkProduct,
  recordPriceObservation, getPriceHistory, recentProducts,
  createObservation, confirmObservation, createReviewCandidate,
} from './kb.service.js';

/** Product Knowledge Base API. Mounted at /api/kb behind the retailer auth
 *  guard. Reads require product:view; writes require product:manage. */
export const knowledgeRouter = Router();

/** 404 if a feature flag is off, so the client can fall back to the old flow. */
function requireFeature(name: FeatureName) {
  return (_req: Request, _res: Response, next: NextFunction) => {
    if (!features.productKnowledgeBase || !features[name]) {
      return next(notFound('This feature is not enabled'));
    }
    next();
  };
}

function ctxOf(req: Request) {
  return { tenantId: req.auth!.tenantId, shopId: req.auth!.shopId, userId: req.auth!.userId };
}

/* ---------------------------------------------------------------- lookup */

knowledgeRouter.get(
  '/lookup/:barcode',
  requireFeature('enhancedBarcodeLookup'),
  requirePermission(PERMISSIONS.PRODUCT_VIEW),
  asyncHandler(async (req, res) => {
    ok(res, await lookupBarcode(ctxOf(req), req.params.barcode!));
  }),
);

/* ------------------------------------------------ hybrid recognition (P3) */

const recognizeSchema = z.object({
  barcode: z.string().trim().max(64).nullable().optional(),
  ocrText: z.string().max(5000).nullable().optional(),
  offline: z.boolean().optional(),
  deviceId: z.string().trim().max(120).nullable().optional(),
  ocrProvider: z.string().trim().max(60).nullable().optional(),
  ocrProviderVersion: z.string().trim().max(40).nullable().optional(),
  processingMs: z.number().int().min(0).max(600000).nullable().optional(),
  imageQuality: z.enum(['good', 'acceptable', 'retake', 'cannot_process']).nullable().optional(),
}).refine((v) => !!v.barcode || !!v.ocrText, { message: 'Provide a barcode or package text', path: ['ocrText'] });

knowledgeRouter.post(
  '/recognize',
  requireFeature('hybridProductScan'),
  requirePermission(PERMISSIONS.PRODUCT_VIEW),
  asyncHandler(async (req, res) => {
    const input = parseBody(recognizeSchema, req);
    ok(res, await recognize(ctxOf(req), input), 201);
  }),
);

knowledgeRouter.get(
  '/recent-scans',
  requirePermission(PERMISSIONS.PRODUCT_VIEW),
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT o.id, o.observation_type AS "type", o.barcode_value AS "barcode",
              o.confidence_category AS "confidence", o.recommended_action AS "recommendedAction",
              o.status, o.candidate_count AS "candidateCount", o.offline, o.created_at AS "createdAt"
         FROM recognition_observations o
        WHERE o.shop_id = $1 ORDER BY o.created_at DESC LIMIT 30`,
      [req.auth!.shopId],
    );
    ok(res, { data: rows });
  }),
);

/* --------------------------------------------------------- catalog search */

const searchQuery = z.object({ q: z.string().trim().min(1).max(120), limit: z.coerce.number().int().min(1).max(50).default(20) });

knowledgeRouter.get(
  '/search',
  requireFeature('sharedCatalogSearch'),
  requirePermission(PERMISSIONS.PRODUCT_VIEW),
  asyncHandler(async (req, res) => {
    const { q, limit } = parseQuery(searchQuery, req);
    ok(res, await searchCatalog(q, limit));
  }),
);

knowledgeRouter.get(
  '/variants/:id',
  requirePermission(PERMISSIONS.PRODUCT_VIEW),
  asyncHandler(async (req, res) => {
    ok(res, await getVariantDetail(req.params.id!));
  }),
);

/* ------------------------------------------------ retailer product linking */

const linkSchema = z.object({
  variantId: z.string().uuid(),
  globalProductId: z.string().uuid().nullable().optional(),
  observationId: z.string().uuid().nullable().optional(),
});

knowledgeRouter.post(
  '/products/:id/link',
  requirePermission(PERMISSIONS.PRODUCT_MANAGE),
  asyncHandler(async (req, res) => {
    const input = parseBody(linkSchema, req);
    const result = await linkProduct(ctxOf(req), req.params.id!, input);
    await writeAudit({
      tenantId: req.auth!.tenantId, shopId: req.auth!.shopId, actorUserId: req.auth!.userId,
      action: 'catalog.link', resourceType: 'product', resourceId: req.params.id!, requestId: req.id,
    });
    ok(res, result);
  }),
);

knowledgeRouter.post(
  '/products/:id/unlink',
  requirePermission(PERMISSIONS.PRODUCT_MANAGE),
  asyncHandler(async (req, res) => {
    const result = await unlinkProduct(ctxOf(req), req.params.id!);
    await writeAudit({
      tenantId: req.auth!.tenantId, shopId: req.auth!.shopId, actorUserId: req.auth!.userId,
      action: 'catalog.unlink', resourceType: 'product', resourceId: req.params.id!, requestId: req.id,
    });
    ok(res, result);
  }),
);

/* ------------------------------------------------------- price observations */

const priceObsSchema = z.object({
  productId: z.string().uuid(),
  priceType: z.enum(['printed_mrp', 'retailer_selling', 'purchase_cost', 'distributor', 'promotional', 'suggested']),
  amount: z.number().nonnegative().max(100_000_000),
  currency: z.string().trim().length(3).optional(),
});

knowledgeRouter.post(
  '/price-observations',
  requireFeature('productPriceHistory'),
  requirePermission(PERMISSIONS.PRODUCT_MANAGE),
  asyncHandler(async (req, res) => {
    const input = parseBody(priceObsSchema, req);
    const result = await recordPriceObservation(ctxOf(req), input);
    await writeAudit({
      tenantId: req.auth!.tenantId, shopId: req.auth!.shopId, actorUserId: req.auth!.userId,
      action: 'catalog.price_observation', resourceType: 'product', resourceId: input.productId, requestId: req.id,
    });
    ok(res, result, 201);
  }),
);

knowledgeRouter.get(
  '/products/:id/price-history',
  requireFeature('productPriceHistory'),
  requirePermission(PERMISSIONS.PRODUCT_VIEW),
  asyncHandler(async (req, res) => {
    ok(res, await getPriceHistory(ctxOf(req), req.params.id!));
  }),
);

/* ------------------------------------------------------------ recent products */

const recentQuery = z.object({
  type: z.enum(['created', 'updated', 'scanned']).default('created'),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

knowledgeRouter.get(
  '/recent',
  requirePermission(PERMISSIONS.PRODUCT_VIEW),
  asyncHandler(async (req, res) => {
    const { type, limit } = parseQuery(recentQuery, req);
    ok(res, await recentProducts(ctxOf(req), type, limit));
  }),
);

/* -------------------------------------------------- observations & confirms */

const obsSchema = z.object({
  observationType: z.enum(['manual_search', 'manual_selection']),
  rawValue: z.string().trim().max(200).optional(),
  barcodeValue: z.string().trim().max(64).optional(),
});

knowledgeRouter.post(
  '/observations',
  requirePermission(PERMISSIONS.PRODUCT_VIEW),
  asyncHandler(async (req, res) => {
    ok(res, await createObservation(ctxOf(req), parseBody(obsSchema, req)), 201);
  }),
);

const confirmSchema = z.object({
  action: z.enum(['confirmed_suggested', 'selected_different', 'created_retailer_product', 'created_review_candidate', 'rejected_all', 'marked_invalid']),
  variantId: z.string().uuid().nullable().optional(),
  globalProductId: z.string().uuid().nullable().optional(),
  retailerProductId: z.string().uuid().nullable().optional(),
  correctionReason: z.string().trim().max(300).nullable().optional(),
});

knowledgeRouter.post(
  '/observations/:id/confirm',
  requirePermission(PERMISSIONS.PRODUCT_MANAGE),
  asyncHandler(async (req, res) => {
    ok(res, await confirmObservation(ctxOf(req), req.params.id!, parseBody(confirmSchema, req)), 201);
  }),
);

/* -------------------------------------------------- catalog suggestions */

const suggestSchema = z.object({
  candidateType: z.enum(['new_product', 'alias', 'barcode', 'correction', 'packaging_version', 'merge']),
  proposedAction: z.string().trim().max(200).optional(),
  proposedBarcode: z.string().trim().max(64).optional(),
  proposedAlias: z.string().trim().max(160).optional(),
  proposedGlobalProductId: z.string().uuid().nullable().optional(),
  proposedVariantId: z.string().uuid().nullable().optional(),
  proposedData: z.record(z.unknown()).optional(),
  sourceObservationId: z.string().uuid().nullable().optional(),
});

knowledgeRouter.post(
  '/suggest',
  requireFeature('catalogSuggestions'),
  requirePermission(PERMISSIONS.PRODUCT_MANAGE),
  asyncHandler(async (req, res) => {
    const input = parseBody(suggestSchema, req);
    const result = await createReviewCandidate(ctxOf(req), input);
    await writeAudit({
      tenantId: req.auth!.tenantId, shopId: req.auth!.shopId, actorUserId: req.auth!.userId,
      action: 'catalog.suggest', resourceType: 'review_candidate',
      resourceId: (result as { id: string }).id, requestId: req.id,
    });
    ok(res, result, 201);
  }),
);

/* ------------------------------------- review queue (catalog admins only) */

knowledgeRouter.get(
  '/review',
  requirePermission(PERMISSIONS.CATALOG_REVIEW),
  asyncHandler(async (req, res) => {
    if (!features.productKnowledgeBase) throw notFound('Not enabled');
    const status = typeof req.query.status === 'string' ? req.query.status : 'pending';
    if (!['pending', 'approved', 'rejected', 'conflicted'].includes(status)) throw businessRule('Invalid status');
    const { rows } = await query(
      `SELECT id, candidate_type AS "candidateType", proposed_action AS "proposedAction",
              proposed_barcode AS "proposedBarcode", proposed_alias AS "proposedAlias",
              review_status AS "reviewStatus", confirmation_count AS "confirmationCount",
              conflict_count AS "conflictCount", created_at AS "createdAt"
         FROM catalog_review_candidates
        WHERE tenant_id = $1 AND review_status = $2
        ORDER BY created_at DESC LIMIT 100`,
      [req.auth!.tenantId, status],
    );
    ok(res, { data: rows });
  }),
);
