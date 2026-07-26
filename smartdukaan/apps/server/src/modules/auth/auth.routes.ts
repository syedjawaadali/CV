import { Router, type Request, type Response } from 'express';
import { loginSchema, registerSchema, type AuthResponse } from '@smartdukaan/shared';
import { asyncHandler, ok, parseBody } from '../../lib/http.js';
import { requireAuth } from '../../middleware/auth.js';
import { writeAudit } from '../../lib/audit.js';
import { ttlToMs } from '../../lib/jwt.js';
import { env } from '../../config/env.js';
import { unauthorized } from '../../lib/errors.js';
import { getMe, login, logout, refresh, registerOwner } from './auth.service.js';

const REFRESH_COOKIE = 'sd_refresh';

function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: env.isProduction ? 'none' : 'lax',
    path: '/api/auth',
    maxAge: ttlToMs(env.refreshTokenTtl),
  });
}

function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
}

function readRefreshCookie(req: Request): string | undefined {
  const cookies = (req as Request & { cookies?: Record<string, string> }).cookies;
  return cookies?.[REFRESH_COOKIE];
}

export const authRouter = Router();

authRouter.post(
  '/register',
  asyncHandler(async (req, res) => {
    const input = parseBody(registerSchema, req);
    const result = await registerOwner(input, req.headers['user-agent']);
    setRefreshCookie(res, result.refreshToken);
    await writeAudit({
      tenantId: result.user.tenantId, shopId: result.user.shopId,
      actorUserId: result.user.id, action: 'auth.register',
      resourceType: 'user', resourceId: result.user.id, requestId: req.id,
    });
    const body: AuthResponse = { user: result.user, accessToken: result.accessToken };
    ok(res, body, 201);
  }),
);

authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const input = parseBody(loginSchema, req);
    const result = await login(input.email, input.password, req.headers['user-agent']);
    setRefreshCookie(res, result.refreshToken);
    await writeAudit({
      tenantId: result.user.tenantId, shopId: result.user.shopId,
      actorUserId: result.user.id, action: 'auth.login',
      resourceType: 'user', resourceId: result.user.id, requestId: req.id,
    });
    const body: AuthResponse = { user: result.user, accessToken: result.accessToken };
    ok(res, body);
  }),
);

authRouter.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const raw = readRefreshCookie(req);
    if (!raw) throw unauthorized('Your session has expired. Please sign in again.');
    const result = await refresh(raw, req.headers['user-agent']);
    setRefreshCookie(res, result.refreshToken);
    const body: AuthResponse = { user: result.user, accessToken: result.accessToken };
    ok(res, body);
  }),
);

authRouter.post(
  '/logout',
  asyncHandler(async (req, res) => {
    await logout(readRefreshCookie(req));
    clearRefreshCookie(res);
    ok(res, { ok: true });
  }),
);

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await getMe(req.auth!.userId);
    ok(res, { user });
  }),
);
