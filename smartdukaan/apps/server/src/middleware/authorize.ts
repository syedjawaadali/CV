import type { NextFunction, Request, Response } from 'express';
import { roleHasPermission, type Permission } from '@smartdukaan/shared';
import { forbidden, unauthorized } from '../lib/errors.js';

/**
 * Route guard requiring a specific permission. Every protected endpoint uses
 * this — authorization is enforced on the server regardless of what the UI
 * shows or hides.
 */
export function requirePermission(permission: Permission) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) return next(unauthorized());
    if (!roleHasPermission(req.auth.role, permission)) {
      return next(forbidden());
    }
    next();
  };
}
