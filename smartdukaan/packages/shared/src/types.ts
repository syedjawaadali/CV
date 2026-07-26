import type { Role } from './roles.js';

/** DTOs returned by the API. Money fields are integer minor units (paisa). */

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: 'active' | 'suspended';
  tenantId: string;
  shopId: string;
  shopName: string;
  language: 'en' | 'ur';
}

export interface AuthResponse {
  user: AuthUser;
  accessToken: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string | null;
  locality: string | null;
  note: string | null;
  balanceMinor: number; // outstanding khata balance (customer owes shop)
  createdAt: string;
}

export interface Product {
  id: string;
  name: string;
  nameUr: string | null;
  barcode: string | null;
  category: string | null;
  unit: string;
  costPriceMinor: number;
  sellingPriceMinor: number;
  stockQty: string; // numeric string to preserve precision
  lowStockThreshold: string;
  active: boolean;
  createdAt: string;
}

export interface SaleItem {
  id: string;
  productId: string | null;
  name: string;
  quantity: string;
  unitPriceMinor: number;
  lineTotalMinor: number;
}

export interface Sale {
  id: string;
  receiptNumber: string;
  customerId: string | null;
  customerName: string | null;
  paymentMethod: 'cash' | 'credit' | 'digital';
  status: 'completed' | 'reversed';
  subtotalMinor: number;
  discountMinor: number;
  totalMinor: number;
  amountOnly: boolean;
  note: string | null;
  createdByName: string;
  createdAt: string;
  items: SaleItem[];
}

export interface KhataTransaction {
  id: string;
  type: 'credit' | 'payment' | 'adjustment' | 'reversal';
  amountMinor: number; // signed: positive increases balance owed, negative reduces
  balanceAfterMinor: number;
  note: string | null;
  createdByName: string;
  createdAt: string;
}

export interface InventoryMovement {
  id: string;
  type: string;
  quantityDelta: string;
  balanceAfter: string;
  reason: string | null;
  note: string | null;
  createdAt: string;
}

export interface Expense {
  id: string;
  category: string;
  amountMinor: number;
  note: string | null;
  createdByName: string;
  createdAt: string;
}

export interface DailyClosing {
  id: string;
  businessDate: string;
  cashSalesMinor: number;
  digitalSalesMinor: number;
  creditSalesMinor: number;
  khataCollectedMinor: number;
  expensesMinor: number;
  expectedCashMinor: number;
  countedCashMinor: number;
  differenceMinor: number;
  note: string | null;
  createdByName: string;
  createdAt: string;
}

export interface DashboardSummary {
  date: string;
  todaySalesMinor: number;
  cashSalesMinor: number;
  creditSalesMinor: number;
  digitalSalesMinor: number;
  khataCollectedTodayMinor: number;
  expensesTodayMinor: number;
  outstandingKhataMinor: number;
  estimatedProfitMinor: number;
  profitIsEstimated: boolean;
  lowStockCount: number;
  saleCountToday: number;
  closingDoneToday: boolean;
}

export interface Paginated<T> {
  data: T[];
  nextCursor: string | null;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    fieldErrors?: Record<string, string>;
    requestId?: string;
  };
}
