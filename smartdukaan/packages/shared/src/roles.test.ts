import { describe, it, expect } from 'vitest';
import { ROLES, PERMISSIONS, roleHasPermission } from './roles.js';

describe('role → permission matrix', () => {
  it('owner has every permission', () => {
    for (const p of Object.values(PERMISSIONS)) {
      expect(roleHasPermission(ROLES.OWNER, p)).toBe(true);
    }
  });

  it('cashier can create sales but cannot view profit or manage employees', () => {
    expect(roleHasPermission(ROLES.CASHIER, PERMISSIONS.SALE_CREATE)).toBe(true);
    expect(roleHasPermission(ROLES.CASHIER, PERMISSIONS.KHATA_MANAGE)).toBe(true);
    expect(roleHasPermission(ROLES.CASHIER, PERMISSIONS.PROFIT_VIEW)).toBe(false);
    expect(roleHasPermission(ROLES.CASHIER, PERMISSIONS.EMPLOYEE_MANAGE)).toBe(false);
    expect(roleHasPermission(ROLES.CASHIER, PERMISSIONS.SALE_REVERSE)).toBe(false);
  });

  it('inventory role manages stock but cannot create sales', () => {
    expect(roleHasPermission(ROLES.INVENTORY, PERMISSIONS.INVENTORY_MANAGE)).toBe(true);
    expect(roleHasPermission(ROLES.INVENTORY, PERMISSIONS.PURCHASE_MANAGE)).toBe(true);
    expect(roleHasPermission(ROLES.INVENTORY, PERMISSIONS.SALE_CREATE)).toBe(false);
  });

  it('viewer is read-only', () => {
    expect(roleHasPermission(ROLES.VIEWER, PERMISSIONS.SALE_VIEW)).toBe(true);
    expect(roleHasPermission(ROLES.VIEWER, PERMISSIONS.SALE_CREATE)).toBe(false);
    expect(roleHasPermission(ROLES.VIEWER, PERMISSIONS.KHATA_MANAGE)).toBe(false);
  });
});
