import crypto from 'node:crypto';
import type { PoolClient } from 'pg';
import type { Request } from 'express';
import { withTransaction } from '../db/pool.js';
import { AppError, conflict } from './errors.js';

/**
 * Idempotent execution for financial create operations. The claim row and the
 * operation commit atomically in one transaction, so a retried request (same
 * Idempotency-Key) never creates a duplicate sale/payment — it replays the
 * original response instead. A same key with a different body is rejected.
 */

export interface IdempotentResult<T> {
  status: number;
  body: T;
  replayed: boolean;
}

function hashBody(body: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(body ?? {})).digest('hex');
}

export function getIdempotencyKey(req: Request): string | null {
  const raw = req.header('Idempotency-Key');
  return raw && raw.trim().length > 0 ? raw.trim().slice(0, 200) : null;
}

export async function runIdempotent<T>(
  req: Request,
  run: (tx: PoolClient) => Promise<{ status: number; body: T }>,
): Promise<IdempotentResult<T>> {
  const key = getIdempotencyKey(req);
  const tenantId = req.auth!.tenantId;
  const userId = req.auth!.userId;
  const requestHash = hashBody(req.body);

  if (!key) {
    const r = await withTransaction((tx) => run(tx));
    return { ...r, replayed: false };
  }

  return withTransaction(async (tx) => {
    const claim = await tx.query(
      `INSERT INTO idempotency_keys (tenant_id, user_id, idem_key, request_hash)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (tenant_id, idem_key) DO NOTHING
       RETURNING id`,
      [tenantId, userId, key, requestHash],
    );

    if (claim.rowCount === 0) {
      const existing = await tx.query<{
        request_hash: string; response_status: number | null; response_body: unknown;
      }>(
        `SELECT request_hash, response_status, response_body
           FROM idempotency_keys WHERE tenant_id = $1 AND idem_key = $2`,
        [tenantId, key],
      );
      const row = existing.rows[0];
      if (!row) throw conflict('Could not process this request. Please retry.');
      if (row.request_hash !== requestHash) {
        throw new AppError(
          'IDEMPOTENCY_CONFLICT',
          'This request key was already used with different data.',
        );
      }
      if (row.response_status == null) {
        throw conflict('This request is already being processed.');
      }
      return { status: row.response_status, body: row.response_body as T, replayed: true };
    }

    const result = await run(tx);
    await tx.query(
      `UPDATE idempotency_keys SET response_status = $1, response_body = $2
        WHERE tenant_id = $3 AND idem_key = $4`,
      [result.status, JSON.stringify(result.body), tenantId, key],
    );
    return { ...result, replayed: false };
  });
}
