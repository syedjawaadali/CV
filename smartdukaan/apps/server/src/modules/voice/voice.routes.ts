/**
 * Voice assistant API (Phase 5). Mounted at /api/voice behind retailer auth.
 * The client sends TEXT (device-native STT) or, optionally, audio for the cloud
 * path; the backend interprets, previews, and only executes on confirmation
 * through the existing business services.
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { PERMISSIONS, type Role } from '@smartdukaan/shared';
import { asyncHandler, ok, parseBody } from '../../lib/http.js';
import { requirePermission } from '../../middleware/authorize.js';
import { notFound } from '../../lib/errors.js';
import { rateLimit } from '../../middleware/rateLimit.js';
import { features, type FeatureName } from '../../config/features.js';
import { interpret, confirmAction, type VoiceCtx } from './voice.service.js';
import { rememberProductAlias, listMemory, deleteMemory } from './memory.service.js';

export const voiceRouter = Router();

function requireFeature(name: FeatureName) {
  return (_req: Request, _res: Response, next: NextFunction) => {
    if (!features[name]) return next(notFound('This feature is not enabled'));
    next();
  };
}
voiceRouter.use(requireFeature('voiceAssistant'));

function vctx(req: Request): VoiceCtx {
  return { tenantId: req.auth!.tenantId, shopId: req.auth!.shopId, userId: req.auth!.userId, role: req.auth!.role as Role };
}

const voiceLimiter = rateLimit([
  { limit: 30, windowMs: 60_000, scope: 'user' },
  { limit: 90, windowMs: 60_000, scope: 'shop' },
  { limit: 30, windowMs: 60_000, scope: 'device' },
]);

/* --------------------------------------------------------------- interpret */

const interpretSchema = z.object({
  transcript: z.string().trim().min(1).max(400),
  language: z.string().max(12).nullable().optional(),
  deviceId: z.string().max(120).nullable().optional(),
  privacyMode: z.boolean().optional(),
  offline: z.boolean().optional(),
  clientActionId: z.string().max(120).nullable().optional(),
});

voiceRouter.post(
  '/interpret',
  requirePermission(PERMISSIONS.PRODUCT_VIEW), // minimal gate; per-intent permission checked inside
  voiceLimiter,
  asyncHandler(async (req, res) => {
    const body = parseBody(interpretSchema, req);
    ok(res, await interpret(vctx(req), body), 201);
  }),
);

/* ----------------------------------------------------------------- confirm */

const confirmSchema = z.object({
  actionId: z.string().uuid(),
  confirmationToken: z.string().min(1).max(200),
  spokenConfirmation: z.string().max(200).nullable().optional(),
  offline: z.boolean().optional(),
});

voiceRouter.post(
  '/confirm',
  requirePermission(PERMISSIONS.PRODUCT_VIEW),
  voiceLimiter,
  asyncHandler(async (req, res) => {
    const body = parseBody(confirmSchema, req);
    ok(res, await confirmAction(vctx(req), body), 201);
  }),
);

/* ------------------------------------------------------------------ cancel */

voiceRouter.post(
  '/cancel',
  requirePermission(PERMISSIONS.PRODUCT_VIEW),
  asyncHandler(async (req, res) => {
    const body = parseBody(z.object({ actionId: z.string().uuid() }), req);
    // A cancel is a confirm with a cancellation word — reuse the same guard path.
    ok(res, await confirmAction(vctx(req), { actionId: body.actionId, confirmationToken: '', spokenConfirmation: 'cancel' }));
  }),
);

/* ------------------------------------------------------------------ memory */

const memorySchema = z.object({
  spokenForm: z.string().trim().min(1).max(80),
  productId: z.string().uuid(),
  approved: z.boolean().optional(),
  language: z.string().max(12).nullable().optional(),
});

voiceRouter.get(
  '/memory',
  requireFeature('voiceMemory'),
  requirePermission(PERMISSIONS.PRODUCT_VIEW),
  asyncHandler(async (req, res) => ok(res, { data: await listMemory({ shopId: req.auth!.shopId }) })),
);

voiceRouter.post(
  '/memory',
  requireFeature('voiceMemory'),
  requirePermission(PERMISSIONS.PRODUCT_MANAGE),
  asyncHandler(async (req, res) => {
    const body = parseBody(memorySchema, req);
    const id = await rememberProductAlias(vctx(req), body.spokenForm, body.productId, body.approved ?? true, body.language);
    ok(res, { id }, 201);
  }),
);

voiceRouter.post(
  '/memory/:id/delete',
  requireFeature('voiceMemory'),
  requirePermission(PERMISSIONS.PRODUCT_MANAGE),
  asyncHandler(async (req, res) => {
    const okDel = await deleteMemory(vctx(req), req.params.id!);
    if (!okDel) throw notFound('Memory not found');
    ok(res, { deleted: true });
  }),
);
