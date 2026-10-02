/**
 * Inventory snapshot types + freshness / data-quality classifiers (Phase 6) —
 * pure, deterministic. Every alert, forecast and summary is computed from ONE
 * common snapshot rather than re-deriving stock, so results never disagree.
 *
 * The snapshot NEVER changes inventory. Freshness and data-quality are carried
 * through every result so stale/conflicted data is never presented as exact.
 */

export type FreshnessStatus =
  | 'current' | 'recently_synced' | 'pending_local' | 'partially_synced'
  | 'stale' | 'conflicted' | 'unknown';

export type DataQuality =
  | 'good' | 'usable_with_limits' | 'incomplete' | 'conflicted' | 'insufficient_for_forecast';

export interface InventorySnapshot {
  productId: string;
  name: string;
  unit: string;
  onHand: number;          // cached balance = sum of movements
  reserved: number;        // reserved for unfulfilled orders
  incoming: number;        // recorded as incoming (pending purchase drafts/orders)
  damaged: number;         // damaged movements (excluded from available)
  available: number;       // onHand - reserved (never below 0 for "available")
  lowStockThreshold: number;
  reorderQty: number | null;
  perishable: boolean;
  expiryDate: string | null;         // ISO date, if recorded
  importance: ProductImportance;
  intentionallyUnstocked: boolean;
  active: boolean;
  createdAt: string;
  lastSaleAt: string | null;
  lastPurchaseAt: string | null;
  lastMovementAt: string | null;
  lastStockCountAt: string | null;
  pendingLocalMovements: number;     // count of unsynced local movements
  hasConflict: boolean;
  freshness: FreshnessStatus;
  dataQuality: DataQuality;
}

export type ProductImportance = 'essential' | 'important' | 'normal' | 'optional' | 'seasonal';

export interface SnapshotInputs {
  onHand: number;
  reserved?: number;
  incoming?: number;
  damaged?: number;
  lowStockThreshold: number;
  pendingLocalMovements?: number;
  hasConflict?: boolean;
  lastSyncAgeMs?: number | null;   // how long since the shop last synced
  nonZeroSaleDays?: number;        // for data-quality → forecast eligibility
  historyDays?: number;
  hasUnit?: boolean;
  hasSellingPrice?: boolean;
  recentlyCreated?: boolean;       // created within the "new product" window
  excessiveAdjustments?: boolean;
}

export const FRESHNESS_LIMITS = {
  recentlySyncedMs: 60 * 60 * 1000,   // <= 1h → recently synced
  staleMs: 24 * 60 * 60 * 1000,       // > 24h → stale
};

export function classifyFreshness(i: SnapshotInputs): FreshnessStatus {
  if (i.hasConflict) return 'conflicted';
  if ((i.pendingLocalMovements ?? 0) > 0) return 'pending_local';
  const age = i.lastSyncAgeMs;
  if (age == null) return 'unknown';
  if (age <= 0) return 'current';
  if (age <= FRESHNESS_LIMITS.recentlySyncedMs) return 'recently_synced';
  if (age > FRESHNESS_LIMITS.staleMs) return 'stale';
  return 'recently_synced';
}

/** Minimum evidence before a statistical forecast may run. */
export const FORECAST_MIN = {
  nonZeroSaleDays: 5,
  historyDays: 14,
};

export function classifyDataQuality(i: SnapshotInputs): DataQuality {
  if (i.hasConflict) return 'conflicted';
  if (i.hasUnit === false || i.hasSellingPrice === false) return 'incomplete';
  if (i.excessiveAdjustments) return 'usable_with_limits';
  const nonZero = i.nonZeroSaleDays ?? 0;
  const hist = i.historyDays ?? 0;
  if (i.recentlyCreated || nonZero < FORECAST_MIN.nonZeroSaleDays || hist < FORECAST_MIN.historyDays) {
    return 'insufficient_for_forecast';
  }
  return 'good';
}

/** Available stock never reports below zero (negative on-hand is a separate alert). */
export function availableFrom(onHand: number, reserved = 0): number {
  return Math.max(0, onHand - reserved);
}

/** Whether a statistical forecast is permitted for this snapshot. */
export function forecastEligible(q: DataQuality): boolean {
  return q === 'good' || q === 'usable_with_limits';
}
