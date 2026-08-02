/**
 * Lightweight in-memory rate limiter (Phase 4). Guards the cloud-recognition
 * endpoints against accidental repeated taps, scripted abuse and cost attacks.
 * Keyed per identity + window. NOTE: in-memory means per-instance; a multi-
 * instance deployment should back this with Redis — documented as a limitation.
 *
 * Rate limiting applies ONLY to cloud endpoints. It never affects local barcode
 * or OCR endpoints.
 */
import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../lib/errors.js';

interface Bucket { count: number; resetAt: number }
const buckets = new Map<string, Bucket>();

function hit(key: string, limit: number, windowMs: number, now: number): boolean {
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (b.count >= limit) return false;
  b.count += 1;
  return true;
}

/** Occasionally evict expired buckets so the map cannot grow unbounded. */
function sweep(now: number) {
  if (buckets.size < 5000) return;
  for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
}

export interface RateLimitRule { limit: number; windowMs: number; scope: 'user' | 'shop' | 'device' }

export function rateLimit(rules: RateLimitRule[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const now = Date.now();
    sweep(now);
    const auth = req.auth;
    if (!auth) return next(); // auth middleware handles unauthenticated requests
    for (const rule of rules) {
      let id: string | undefined;
      if (rule.scope === 'user') id = auth.userId;
      else if (rule.scope === 'shop') id = auth.shopId;
      else if (rule.scope === 'device') id = (req.body?.deviceId as string) || auth.userId;
      if (!id) continue;
      const key = `${rule.scope}:${id}:${req.baseUrl}${req.path}`;
      if (!hit(key, rule.limit, rule.windowMs, now)) {
        return next(new AppError('RATE_LIMIT', 'Too many requests — please wait a moment and try again.'));
      }
    }
    next();
  };
}

/** Test helper: clear all buckets between tests. */
export function __resetRateLimit(): void { buckets.clear(); }
