import type { PoolClient } from 'pg';
import { pool } from '../db/pool.js';
import { logger } from './logger.js';

/**
 * Append an immutable audit record for a security- or finance-significant
 * action. Audit rows are never updated or deleted by application code. Never
 * store secrets or full sensitive payloads here — only safe metadata.
 */
export interface AuditInput {
  tenantId?: string | null;
  shopId?: string | null;
  actorUserId?: string | null;
  action: string;
  resourceType?: string | null;
  resourceId?: string | null;
  requestId?: string | null;
  metadata?: Record<string, unknown> | null;
}

export async function writeAudit(input: AuditInput, tx?: PoolClient): Promise<void> {
  const runner = tx ?? pool;
  try {
    await runner.query(
      `INSERT INTO audit_logs
         (tenant_id, shop_id, actor_user_id, action, resource_type, resource_id, request_id, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        input.tenantId ?? null,
        input.shopId ?? null,
        input.actorUserId ?? null,
        input.action,
        input.resourceType ?? null,
        input.resourceId ?? null,
        input.requestId ?? null,
        input.metadata ? JSON.stringify(input.metadata) : null,
      ],
    );
  } catch (err) {
    // Auditing must never break the primary operation, but failures are logged.
    logger.error('audit write failed', {
      action: input.action,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
