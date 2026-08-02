import type { NextFunction, Request, Response } from 'express';
import { isRole } from '@smartdukaan/shared';
import { query } from '../db/pool.js';
import { verifyAccessToken } from '../lib/jwt.js';
import { unauthorized, forbidden } from '../lib/errors.js';

/**
 * Authenticates a request from its Bearer access token, then loads the user
 * from the database to confirm they still exist and are active. The token is
 * NOT trusted on its own for authorization state (status/role are re-read).
 */
export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw unauthorized('You are not signed in');
    }
    const token = header.slice('Bearer '.length).trim();
    const payload = verifyAccessToken(token);

    const { rows } = await query<{
      id: string; tenant_id: string; shop_id: string; name: string;
      email: string; role: string; status: string;
    }>(
      `SELECT id, tenant_id, shop_id, name, email, role, status
         FROM users WHERE id = $1`,
      [payload.sub],
    );
    const user = rows[0];
    if (!user) throw unauthorized('Your account was not found');
    if (user.status !== 'active') throw forbidden('Your account has been suspended');
    if (!isRole(user.role)) throw forbidden('Your account role is invalid');

    // Guard against a stale token whose embedded tenant/shop no longer matches.
    if (user.tenant_id !== payload.tid || user.shop_id !== payload.sid) {
      throw unauthorized('Your session is no longer valid');
    }

    req.auth = {
      userId: user.id,
      tenantId: user.tenant_id,
      shopId: user.shop_id,
      role: user.role,
      name: user.name,
      email: user.email,
    };
    next();
  } catch (err) {
    next(err);
  }
}
