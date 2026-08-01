/**
 * Central role + permission model. Role names and permissions are defined ONCE
 * here and imported everywhere — never hardcoded as string literals across the
 * codebase. Authorization is always enforced server-side; the web app uses the
 * same constants only to decide what to show.
 */

export const ROLES = {
  OWNER: 'owner',
  MANAGER: 'manager',
  CASHIER: 'cashier',
  INVENTORY: 'inventory',
  VIEWER: 'viewer',
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const ALL_ROLES: Role[] = Object.values(ROLES);

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ALL_ROLES as string[]).includes(value);
}

/**
 * Permissions are fine-grained capabilities. Each protected endpoint declares
 * the permission it requires; the authorize middleware checks the caller's role
 * against this matrix.
 */
export const PERMISSIONS = {
  SHOP_MANAGE: 'shop:manage',
  EMPLOYEE_MANAGE: 'employee:manage',
  CUSTOMER_VIEW: 'customer:view',
  CUSTOMER_MANAGE: 'customer:manage',
  PRODUCT_VIEW: 'product:view',
  PRODUCT_MANAGE: 'product:manage',
  SALE_CREATE: 'sale:create',
  SALE_VIEW: 'sale:view',
  SALE_REVERSE: 'sale:reverse',
  KHATA_VIEW: 'khata:view',
  KHATA_MANAGE: 'khata:manage',
  INVENTORY_VIEW: 'inventory:view',
  INVENTORY_MANAGE: 'inventory:manage',
  PURCHASE_MANAGE: 'purchase:manage',
  SUPPLIER_MANAGE: 'supplier:manage',
  EXPENSE_MANAGE: 'expense:manage',
  CLOSING_MANAGE: 'closing:manage',
  REPORT_VIEW: 'report:view',
  PROFIT_VIEW: 'profit:view',
  // Approving changes to the SHARED product catalog is an admin-level action.
  // Ordinary staff never receive it; only the owner (platform-admin stand-in).
  CATALOG_REVIEW: 'catalog:review',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

const P = PERMISSIONS;

/** Role → granted permissions. Owner has everything. */
export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  [ROLES.OWNER]: Object.values(P),
  [ROLES.MANAGER]: [
    P.EMPLOYEE_MANAGE,
    P.CUSTOMER_VIEW, P.CUSTOMER_MANAGE,
    P.PRODUCT_VIEW, P.PRODUCT_MANAGE,
    P.SALE_CREATE, P.SALE_VIEW, P.SALE_REVERSE,
    P.KHATA_VIEW, P.KHATA_MANAGE,
    P.INVENTORY_VIEW, P.INVENTORY_MANAGE,
    P.PURCHASE_MANAGE, P.SUPPLIER_MANAGE,
    P.EXPENSE_MANAGE, P.CLOSING_MANAGE,
    P.REPORT_VIEW, P.PROFIT_VIEW,
  ],
  [ROLES.CASHIER]: [
    P.CUSTOMER_VIEW, P.CUSTOMER_MANAGE,
    P.PRODUCT_VIEW,
    P.SALE_CREATE, P.SALE_VIEW,
    P.KHATA_VIEW, P.KHATA_MANAGE,
    P.INVENTORY_VIEW,
    P.REPORT_VIEW, // basic dashboard (profit is redacted without PROFIT_VIEW)
  ],
  [ROLES.INVENTORY]: [
    P.PRODUCT_VIEW, P.PRODUCT_MANAGE,
    P.INVENTORY_VIEW, P.INVENTORY_MANAGE,
    P.PURCHASE_MANAGE, P.SUPPLIER_MANAGE,
    P.REPORT_VIEW,
  ],
  [ROLES.VIEWER]: [
    P.CUSTOMER_VIEW, P.PRODUCT_VIEW, P.SALE_VIEW,
    P.KHATA_VIEW, P.INVENTORY_VIEW, P.REPORT_VIEW,
  ],
};

export function roleHasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}
