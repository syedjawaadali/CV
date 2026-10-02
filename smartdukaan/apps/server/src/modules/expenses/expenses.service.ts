/**
 * Expense service (Phase 5 refactor). Extracted from the route so BOTH the HTTP
 * route and the voice executor create expenses through one code path — the voice
 * assistant never writes to the expenses table directly.
 */
import { toMinor } from '@smartdukaan/shared';
import { query } from '../../db/pool.js';
import { writeAudit } from '../../lib/audit.js';

interface Ctx { tenantId: string; shopId: string; userId: string }

const SELECT = `
  e.id, e.category, e.amount_minor AS "amountMinor", e.note,
  u.name AS "createdByName", e.created_at AS "createdAt"`;

export async function createExpense(
  ctx: Ctx, input: { category: string; amount: number; note?: string | null }, requestId?: string,
) {
  const inserted = await query<{ id: string }>(
    `INSERT INTO expenses (tenant_id, shop_id, category, amount_minor, note, created_by)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [ctx.tenantId, ctx.shopId, input.category, toMinor(input.amount), input.note ?? null, ctx.userId],
  );
  const { rows } = await query(
    `SELECT ${SELECT} FROM expenses e JOIN users u ON u.id = e.created_by WHERE e.id = $1`,
    [inserted.rows[0]!.id],
  );
  await writeAudit({
    tenantId: ctx.tenantId, shopId: ctx.shopId, actorUserId: ctx.userId,
    action: 'expense.create', resourceType: 'expense', resourceId: inserted.rows[0]!.id, requestId,
    metadata: { category: input.category },
  });
  return rows[0] as Record<string, unknown>;
}

export async function listExpenses(ctx: Ctx, limit = 100) {
  const { rows } = await query(
    `SELECT ${SELECT} FROM expenses e JOIN users u ON u.id = e.created_by
      WHERE e.shop_id = $1 ORDER BY e.created_at DESC LIMIT $2`,
    [ctx.shopId, limit],
  );
  return rows;
}
