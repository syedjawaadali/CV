import type { Role } from '@smartdukaan/shared';
import { ROLES } from '@smartdukaan/shared';
import { query } from '../../db/pool.js';
import { hashPassword } from '../../lib/password.js';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors.js';

export interface AuthCtx {
  userId: string; tenantId: string; shopId: string; role: Role;
}

const EMPLOYEE_SELECT = `
  id, name, email, role, status, language,
  created_at AS "createdAt"`;

export async function listEmployees(ctx: AuthCtx) {
  const { rows } = await query(
    `SELECT ${EMPLOYEE_SELECT} FROM users
      WHERE tenant_id = $1 AND shop_id = $2
      ORDER BY created_at ASC`,
    [ctx.tenantId, ctx.shopId],
  );
  return rows;
}

export async function createEmployee(
  ctx: AuthCtx,
  input: { name: string; email: string; password: string; role: string },
) {
  // Only an owner may create another owner.
  if (input.role === ROLES.OWNER && ctx.role !== ROLES.OWNER) {
    throw forbidden('Only the owner can create another owner account');
  }
  const exists = await query('SELECT 1 FROM users WHERE lower(email) = lower($1)', [input.email]);
  if (exists.rowCount && exists.rowCount > 0) {
    throw conflict('An account with this email already exists.');
  }
  const passwordHash = await hashPassword(input.password);
  const { rows } = await query(
    `INSERT INTO users (tenant_id, shop_id, name, email, password_hash, role, status, language)
     VALUES ($1,$2,$3,$4,$5,$6,'active','en')
     RETURNING ${EMPLOYEE_SELECT}`,
    [ctx.tenantId, ctx.shopId, input.name, input.email, passwordHash, input.role],
  );
  return rows[0]!;
}

export async function updateEmployee(
  ctx: AuthCtx,
  targetId: string,
  input: { role?: string; status?: string },
) {
  const target = await query<{ id: string; role: string }>(
    'SELECT id, role FROM users WHERE id = $1 AND tenant_id = $2 AND shop_id = $3',
    [targetId, ctx.tenantId, ctx.shopId],
  );
  const row = target.rows[0];
  if (!row) throw notFound('Employee not found');
  if (row.id === ctx.userId) throw badRequest('You cannot change your own role or status');
  if (row.role === ROLES.OWNER && ctx.role !== ROLES.OWNER) {
    throw forbidden('Only the owner can modify the owner account');
  }
  if (input.role === ROLES.OWNER && ctx.role !== ROLES.OWNER) {
    throw forbidden('Only the owner can grant the owner role');
  }

  const { rows } = await query(
    `UPDATE users SET
       role = COALESCE($1, role),
       status = COALESCE($2, status),
       updated_at = now()
     WHERE id = $3 AND tenant_id = $4 AND shop_id = $5
     RETURNING ${EMPLOYEE_SELECT}`,
    [input.role ?? null, input.status ?? null, targetId, ctx.tenantId, ctx.shopId],
  );

  // Revoke active sessions when suspending.
  if (input.status === 'suspended') {
    await query('UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [targetId]);
  }
  return rows[0]!;
}
