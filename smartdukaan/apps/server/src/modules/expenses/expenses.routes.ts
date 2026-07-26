import { Router } from 'express';
import { createExpenseSchema, PERMISSIONS, toMinor } from '@smartdukaan/shared';
import { asyncHandler, ok, parseBody } from '../../lib/http.js';
import { requirePermission } from '../../middleware/authorize.js';
import { query } from '../../db/pool.js';
import { writeAudit } from '../../lib/audit.js';

export const expenseRouter = Router();
expenseRouter.use(requirePermission(PERMISSIONS.EXPENSE_MANAGE));

const SELECT = `
  e.id, e.category, e.amount_minor AS "amountMinor", e.note,
  u.name AS "createdByName", e.created_at AS "createdAt"`;

expenseRouter.get('/', asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT ${SELECT} FROM expenses e JOIN users u ON u.id = e.created_by
      WHERE e.shop_id = $1 ORDER BY e.created_at DESC LIMIT 100`,
    [req.auth!.shopId],
  );
  ok(res, { data: rows });
}));

expenseRouter.post('/', asyncHandler(async (req, res) => {
  const input = parseBody(createExpenseSchema, req);
  const inserted = await query<{ id: string }>(
    `INSERT INTO expenses (tenant_id, shop_id, category, amount_minor, note, created_by)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [req.auth!.tenantId, req.auth!.shopId, input.category, toMinor(input.amount), input.note ?? null, req.auth!.userId],
  );
  const { rows } = await query(
    `SELECT ${SELECT} FROM expenses e JOIN users u ON u.id = e.created_by WHERE e.id = $1`,
    [inserted.rows[0]!.id],
  );
  await writeAudit({
    tenantId: req.auth!.tenantId, shopId: req.auth!.shopId, actorUserId: req.auth!.userId,
    action: 'expense.create', resourceType: 'expense', resourceId: inserted.rows[0]!.id, requestId: req.id,
    metadata: { category: input.category },
  });
  ok(res, rows[0], 201);
}));
