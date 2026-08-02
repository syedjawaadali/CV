import { Router } from 'express';
import { PERMISSIONS, roleHasPermission } from '@smartdukaan/shared';
import { asyncHandler, ok } from '../../lib/http.js';
import { requirePermission } from '../../middleware/authorize.js';
import { getSummary } from './dashboard.service.js';

export const dashboardRouter = Router();

dashboardRouter.get(
  '/summary',
  requirePermission(PERMISSIONS.REPORT_VIEW),
  asyncHandler(async (req, res) => {
    const summary = await getSummary(req.auth!);
    // Redact profit for roles that may not view it (e.g. cashier).
    if (!roleHasPermission(req.auth!.role, PERMISSIONS.PROFIT_VIEW)) {
      summary.estimatedProfitMinor = 0;
      summary.profitIsEstimated = false;
    }
    ok(res, summary);
  }),
);
