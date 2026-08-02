import { Router, type Request } from 'express';
import { createExpenseSchema, PERMISSIONS } from '@smartdukaan/shared';
import { asyncHandler, ok, parseBody } from '../../lib/http.js';
import { requirePermission } from '../../middleware/authorize.js';
import { createExpense, listExpenses } from './expenses.service.js';

export const expenseRouter = Router();
expenseRouter.use(requirePermission(PERMISSIONS.EXPENSE_MANAGE));

function ctxOf(req: Request) {
  return { tenantId: req.auth!.tenantId, shopId: req.auth!.shopId, userId: req.auth!.userId };
}

expenseRouter.get('/', asyncHandler(async (req, res) => {
  ok(res, { data: await listExpenses(ctxOf(req)) });
}));

expenseRouter.post('/', asyncHandler(async (req, res) => {
  const input = parseBody(createExpenseSchema, req);
  const row = await createExpense(ctxOf(req), input, req.id);
  ok(res, row, 201);
}));
