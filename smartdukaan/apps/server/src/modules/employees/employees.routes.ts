import { Router } from 'express';
import { createEmployeeSchema, updateEmployeeSchema, PERMISSIONS } from '@smartdukaan/shared';
import { asyncHandler, ok, parseBody } from '../../lib/http.js';
import { requirePermission } from '../../middleware/authorize.js';
import { writeAudit } from '../../lib/audit.js';
import { createEmployee, listEmployees, updateEmployee, type AuthCtx } from './employees.service.js';

export const employeeRouter = Router();
employeeRouter.use(requirePermission(PERMISSIONS.EMPLOYEE_MANAGE));

const ctx = (req: { auth?: AuthCtx }): AuthCtx => req.auth!;

employeeRouter.get('/', asyncHandler(async (req, res) => {
  ok(res, { data: await listEmployees(ctx(req)) });
}));

employeeRouter.post('/', asyncHandler(async (req, res) => {
  const input = parseBody(createEmployeeSchema, req);
  const employee = await createEmployee(ctx(req), input);
  await writeAudit({
    tenantId: req.auth!.tenantId, shopId: req.auth!.shopId, actorUserId: req.auth!.userId,
    action: 'employee.create', resourceType: 'user', resourceId: employee.id, requestId: req.id,
    metadata: { role: input.role },
  });
  ok(res, employee, 201);
}));

employeeRouter.patch('/:id', asyncHandler(async (req, res) => {
  const input = parseBody(updateEmployeeSchema, req);
  const employee = await updateEmployee(ctx(req), req.params.id!, input);
  await writeAudit({
    tenantId: req.auth!.tenantId, shopId: req.auth!.shopId, actorUserId: req.auth!.userId,
    action: 'employee.update', resourceType: 'user', resourceId: req.params.id!, requestId: req.id,
    metadata: { role: input.role, status: input.status },
  });
  ok(res, employee);
}));
