import { Router } from 'express';
import { z } from 'zod';
import { dailyClosingSchema, PERMISSIONS } from '@smartdukaan/shared';
import { asyncHandler, ok, parseBody, parseQuery } from '../../lib/http.js';
import { requirePermission } from '../../middleware/authorize.js';
import { writeAudit } from '../../lib/audit.js';
import { listClosings, preview, submitClosing } from './closing.service.js';

export const closingRouter = Router();
closingRouter.use(requirePermission(PERMISSIONS.CLOSING_MANAGE));

const previewQuery = z.object({
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, 'Invalid date'),
});

closingRouter.get('/preview', asyncHandler(async (req, res) => {
  const { businessDate } = parseQuery(previewQuery, req);
  ok(res, await preview(req.auth!, businessDate));
}));

closingRouter.get('/', asyncHandler(async (req, res) => {
  ok(res, await listClosings(req.auth!));
}));

closingRouter.post('/', asyncHandler(async (req, res) => {
  const input = parseBody(dailyClosingSchema, req);
  const closing = await submitClosing(req.auth!, input);
  await writeAudit({
    tenantId: req.auth!.tenantId, shopId: req.auth!.shopId, actorUserId: req.auth!.userId,
    action: 'closing.submit', resourceType: 'daily_closing',
    resourceId: (closing as { id: string }).id, requestId: req.id,
  });
  ok(res, closing, 201);
}));
