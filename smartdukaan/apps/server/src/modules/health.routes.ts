import { Router } from 'express';
import { asyncHandler, ok } from '../lib/http.js';
import { checkDatabaseHealth } from '../db/pool.js';
import { safeConfigSummary } from '../config/env.js';

export const healthRouter = Router();

// Liveness — process is up.
healthRouter.get('/', (_req, res) => {
  ok(res, { status: 'ok', service: 'smartdukaan-api', time: new Date().toISOString() });
});

// Readiness — dependencies are reachable. Never exposes secret values.
healthRouter.get(
  '/ready',
  asyncHandler(async (_req, res) => {
    const dbOk = await checkDatabaseHealth();
    ok(res, {
      status: dbOk ? 'ready' : 'degraded',
      database: dbOk ? 'ok' : 'unavailable',
      config: safeConfigSummary(),
    }, dbOk ? 200 : 503);
  }),
);
