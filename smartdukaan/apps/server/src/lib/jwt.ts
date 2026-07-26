import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { Role } from '@smartdukaan/shared';
import { env } from '../config/env.js';
import { unauthorized } from './errors.js';

/**
 * Access tokens are short-lived JWTs signed with JWT_SECRET (server-side only).
 * Refresh tokens are long random opaque strings; only their SHA-256 hash is
 * stored in the database, enabling rotation and revocation. JWT_SECRET is never
 * exposed to clients.
 */

export interface AccessTokenPayload {
  sub: string; // user id
  tid: string; // tenant id
  sid: string; // shop id
  role: Role;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.jwtSecret, {
    expiresIn: env.accessTokenTtl as jwt.SignOptions['expiresIn'],
    algorithm: 'HS256',
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    const decoded = jwt.verify(token, env.jwtSecret, { algorithms: ['HS256'] });
    if (typeof decoded === 'string') throw new Error('unexpected token');
    return decoded as AccessTokenPayload;
  } catch {
    throw unauthorized('Your session is invalid or has expired');
  }
}

export function generateRefreshToken(): { token: string; hash: string } {
  const token = crypto.randomBytes(48).toString('base64url');
  return { token, hash: hashRefreshToken(token) };
}

export function hashRefreshToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** Parse a TTL string like "30d" / "15m" into milliseconds. */
export function ttlToMs(ttl: string): number {
  const m = /^(\d+)([smhd])$/u.exec(ttl.trim());
  if (!m) return 15 * 60 * 1000;
  const value = Number(m[1]);
  const unit = m[2];
  const mult = unit === 's' ? 1000 : unit === 'm' ? 60_000 : unit === 'h' ? 3_600_000 : 86_400_000;
  return value * mult;
}
