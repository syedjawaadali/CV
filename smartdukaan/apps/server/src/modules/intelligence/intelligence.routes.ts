/**
 * Inventory intelligence API (Phase 6). Mounted at /api/intelligence behind
 * retailer auth. Read models require inventory:view; drafts/threshold changes
 * require the corresponding manage permission. Nothing here changes inventory
 * or places an order.
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { PERMISSIONS } from '@smartdukaan/shared';
import { asyncHandler, ok, parseBody, parseQuery } from '../../lib/http.js';
import { requirePermission } from '../../middleware/authorize.js';
import { notFound } from '../../lib/errors.js';
import { features, type FeatureName } from '../../config/features.js';
import { evaluateShop, listOpenAlerts, actOnAlert } from './alerts.service.js';
import { reorderForProduct, reorderSuggestions, createPurchaseDraft, listPurchaseDrafts } from './reorder.service.js';
import { businessSummary } from './summary.service.js';
import { getConsentPref, setConsentPref } from './preferences.service.js';

export const intelligenceRouter = Router();

function requireFeature(name: FeatureName) {
  return (_req: Request, _res: Response, next: NextFunction) => {
    if (!features[name]) return next(notFound('This feature is not enabled'));
    next();
  };
}
intelligenceRouter.use(requireFeature('inventoryIntelligence'));

function ctxOf(req: Request) {
  return { tenantId: req.auth!.tenantId, shopId: req.auth!.shopId, userId: req.auth!.userId };
}
const now = () => new Date();

/* ------------------------------------------------------------------ alerts */

intelligenceRouter.get(
  '/alerts',
  requirePermission(PERMISSIONS.INVENTORY_VIEW),
  asyncHandler(async (req, res) => {
    // Recompute (dedup-safe) then return open alerts. Deterministic + cheap.
    const data = features.deterministicLowStockAlerts ? await evaluateShop(ctxOf(req), now()) : await listOpenAlerts(ctxOf(req), now());
    ok(res, { data });
  }),
);

const actionSchema = z.object({
  action: z.enum(['acknowledge', 'snooze', 'dismiss', 'resolve']),
  snoozeHours: z.number().int().min(1).max(720).optional(),
});

intelligenceRouter.post(
  '/alerts/:id/action',
  requirePermission(PERMISSIONS.INVENTORY_VIEW),
  asyncHandler(async (req, res) => {
    const body = parseBody(actionSchema, req);
    ok(res, await actOnAlert(ctxOf(req), req.params.id!, body.action, body.snoozeHours ?? 24), 201);
  }),
);

/* ---------------------------------------------------------------- reorder */

intelligenceRouter.get(
  '/reorder',
  requireFeature('reorderSuggestions'),
  requirePermission(PERMISSIONS.INVENTORY_VIEW),
  asyncHandler(async (req, res) => ok(res, { data: await reorderSuggestions(ctxOf(req), now()) })),
);

intelligenceRouter.get(
  '/reorder/:productId',
  requireFeature('reorderSuggestions'),
  requirePermission(PERMISSIONS.INVENTORY_VIEW),
  asyncHandler(async (req, res) => ok(res, await reorderForProduct(ctxOf(req), req.params.productId!, now()))),
);

const draftSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().positive().max(1_000_000),
  unit: z.string().max(24).nullable().optional(),
  supplierId: z.string().uuid().nullable().optional(),
});

intelligenceRouter.post(
  '/purchase-drafts',
  requireFeature('reorderSuggestions'),
  requirePermission(PERMISSIONS.PURCHASE_MANAGE), // creating a draft needs purchase rights
  asyncHandler(async (req, res) => ok(res, await createPurchaseDraft(ctxOf(req), parseBody(draftSchema, req)), 201)),
);

intelligenceRouter.get(
  '/purchase-drafts',
  requirePermission(PERMISSIONS.INVENTORY_VIEW),
  asyncHandler(async (req, res) => ok(res, { data: await listPurchaseDrafts({ shopId: req.auth!.shopId }) })),
);

/* ---------------------------------------------------------------- summary */

const summaryQuery = z.object({
  kind: z.enum(['opening', 'closing', 'on_demand', 'needs_attention']).default('on_demand'),
  language: z.enum(['en', 'ur', 'roman_ur', 'mixed']).optional(),
});

intelligenceRouter.get(
  '/summary',
  requirePermission(PERMISSIONS.REPORT_VIEW),
  asyncHandler(async (req, res) => {
    const q = parseQuery(summaryQuery, req);
    const pref = await getConsentPref(ctxOf(req));
    ok(res, await businessSummary(ctxOf(req), q.kind, now(), { privacyMode: pref.privacyMode, language: q.language }));
  }),
);

/* ------------------------------------------------------------ preferences */

intelligenceRouter.get(
  '/preferences',
  requirePermission(PERMISSIONS.INVENTORY_VIEW),
  asyncHandler(async (req, res) => ok(res, await getConsentPref(ctxOf(req)))),
);

const prefSchema = z.object({
  preset: z.enum(['essential_only', 'recommended', 'all_helpful', 'custom']).optional(),
  spokenMode: z.enum(['never', 'when_open', 'while_active', 'summary_time', 'critical_only']).optional(),
  privacyMode: z.boolean().optional(),
  quietHoursStart: z.number().int().min(0).max(23).nullable().optional(),
  quietHoursEnd: z.number().int().min(0).max(23).nullable().optional(),
  dailySummary: z.boolean().optional(),
  language: z.string().max(12).nullable().optional(),
});

intelligenceRouter.put(
  '/preferences',
  requirePermission(PERMISSIONS.INVENTORY_VIEW),
  asyncHandler(async (req, res) => ok(res, await setConsentPref(ctxOf(req), parseBody(prefSchema, req)))),
);
