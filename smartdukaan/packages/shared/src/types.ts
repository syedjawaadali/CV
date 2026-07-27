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
  imageUrl: string | null;
  perishable: boolean;
  costPriceMinor: number;
  sellingPriceMinor: number;
  stockQty: string; // numeric string to preserve precision
  lowStockThreshold: string;
  active: boolean;
  createdAt: string;
}

/** A crowd-sourced barcode → product entry, shared across all shops. */
export interface CatalogEntry {
  barcode: string;
  name: string;
  nameUr: string | null;
  category: string | null;
  defaultUnit: string;
  imageUrl: string | null;
  contributions: number;
}

/** FMCG distributor for one-tap restock. */
export interface Distributor {
  id: string;
  name: string;
  nameUr: string | null;
  category: string | null;
  phone: string | null;
  whatsapp: string | null;
  city: string | null;
  sponsored: boolean;
}

/** The paid FMCG suggestion slot. */
export interface SponsoredItem {
  id: string;
  brand: string;
  name: string;
  nameUr: string | null;
  category: string | null;
  message: string | null;
  messageUr: string | null;
  imageUrl: string | null;
}

/** A low-stock product surfaced for reordering. */
export interface ReorderItem {
  id: string;
  name: string;
  nameUr: string | null;
  category: string | null;
  unit: string;
  stockQty: string;
  lowStockThreshold: string;
  imageUrl: string | null;
}

export interface Suggestions {
  topCategory: string | null;
  reorder: ReorderItem[];
  sponsored: SponsoredItem | null;
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

// --- Online ordering (buyer-facing) ----------------------------------------

export interface StoreCustomer {
  id: string;
  name: string;
  phone: string;
}

export interface StoreAuthResponse {
  token: string;
  customer: StoreCustomer;
}

export interface StoreShop {
  id: string;
  name: string;
  category: string | null;
  address: string | null;
  phone: string | null;
}

export interface StoreProduct {
  id: string;
  name: string;
  nameUr: string | null;
  category: string | null;
  unit: string;
  imageUrl: string | null;
  perishable: boolean;
  sellingPriceMinor: number;
  stockQty: string;
}

export type OrderStatus =
  | 'pending_payment' | 'confirmed' | 'accepted' | 'ready'
  | 'fulfilled' | 'rejected' | 'cancelled' | 'expired';

export interface OrderItem {
  id: string;
  productId?: string | null;
  name: string;
  quantity: string;
  unitPriceMinor: number;
  lineTotalMinor: number;
}

export interface Order {
  id: string;
  shopId?: string;
  shopName?: string;
  customerName: string;
  customerPhone: string;
  status: OrderStatus;
  subtotalMinor: number;
  advanceMinor: number;
  advanceRate: number;
  advancePaid: boolean;
  hasPerishable: boolean;
  pickupBy: string | null;
  note: string | null;
  createdAt: string;
  customerNoShowCount?: number; // retailer view only
  items: OrderItem[];
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
