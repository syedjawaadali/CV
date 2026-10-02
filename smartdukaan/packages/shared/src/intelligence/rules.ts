/**
 * Deterministic inventory alert rules (Phase 6) — pure, no AI. These run BEFORE
 * any forecast and never modify inventory. Each alert carries a stable
 * condition key (for deduplication + lifecycle) and neutral, explainable text.
 * Anomaly language is deliberately non-accusatory.
 */
import type { InventorySnapshot } from './snapshot.js';

export type AlertType =
  | 'out_of_stock' | 'low_stock' | 'negative_stock' | 'expiring_soon' | 'expired'
  | 'expiry_missing' | 'large_adjustment' | 'stock_count_overdue' | 'opening_stock_missing'
  | 'pending_sync' | 'conflict';

export type AlertSeverity = 'critical' | 'urgent' | 'important' | 'helpful';

export interface DeterministicAlert {
  productId: string;
  type: AlertType;
  severity: AlertSeverity;
  conditionKey: string;   // tenant/shop/product added by the service; here product+type+bucket
  conditionVersion: string;
  explanation: string;
  spokenHint: string;     // short phrase for TTS (privacy applied later)
}

export const RULES_VERSION = '1';

export interface RuleConfig {
  expiringSoonDays: number;
  stockCountOverdueDays: number;
  largeAdjustmentAbs: number;   // absolute quantity treated as "large"
  newProductDays: number;
}

export const DEFAULT_RULES: RuleConfig = {
  expiringSoonDays: 3,
  stockCountOverdueDays: 90,
  largeAdjustmentAbs: 100,
  newProductDays: 3,
};

export interface RuleContext {
  now: number;                       // ms timestamp (passed in; no Date.now in pure code)
  lastAdjustmentDelta?: number | null;
  daysSinceStockCount?: number | null;
  openingStockRecorded?: boolean;
}

/**
 * Evaluate all deterministic rules for one snapshot. Intentionally-unstocked and
 * inactive products are suppressed for stock-availability alerts (no nagging).
 */
export function evaluateRules(
  snap: InventorySnapshot, ctx: RuleContext, cfg: RuleConfig = DEFAULT_RULES,
): DeterministicAlert[] {
  const out: DeterministicAlert[] = [];
  const mk = (type: AlertType, severity: AlertSeverity, bucket: string, explanation: string, spokenHint: string) =>
    out.push({ productId: snap.productId, type, severity, conditionVersion: RULES_VERSION,
      conditionKey: `${snap.productId}:${type}:${bucket}`, explanation, spokenHint });

  // Integrity first — these apply even to unstocked products.
  if (snap.onHand < 0) {
    mk('negative_stock', 'critical', 'neg',
      `Recorded stock for ${snap.name} is negative (${snap.onHand}). Please review the movements.`,
      `${snap.name} shows negative stock. Please review it.`);
  }
  if (snap.hasConflict) {
    mk('conflict', 'critical', 'conflict',
      `Stock records for ${snap.name} conflict across devices. Please reconcile before relying on the count.`,
      `${snap.name} has a stock conflict. Please review it.`);
  }
  if (typeof ctx.lastAdjustmentDelta === 'number' && Math.abs(ctx.lastAdjustmentDelta) >= cfg.largeAdjustmentAbs) {
    // Neutral language — never accuses anyone.
    mk('large_adjustment', 'urgent', bucketOf(ctx.lastAdjustmentDelta),
      `A large stock change (${ctx.lastAdjustmentDelta > 0 ? '+' : ''}${ctx.lastAdjustmentDelta}) was recorded for ${snap.name}. Please review it.`,
      `A large stock change was recorded for ${snap.name}. Please review it.`);
  }

  // Availability alerts — skipped for intentionally-unstocked / inactive products.
  const trackAvailability = snap.active && !snap.intentionallyUnstocked;
  if (trackAvailability) {
    if (snap.available <= 0 && snap.onHand >= 0) {
      const incomingNote = snap.incoming > 0 ? ` ${snap.incoming} ${snap.unit} recorded as incoming.` : '';
      mk('out_of_stock', 'urgent', 'zero',
        `${snap.name} is out of stock.${incomingNote}`,
        `${snap.name} is out of stock.${incomingNote}`);
    } else if (snap.available <= snap.lowStockThreshold) {
      mk('low_stock', 'important', thresholdBucket(snap.available, snap.lowStockThreshold),
        `${snap.name} is low: ${snap.available} ${snap.unit} available (threshold ${snap.lowStockThreshold}).`,
        `${snap.name} stock is low. ${snap.available} ${snap.unit} available.`);
    }

    // Opening stock missing for a freshly created product.
    if (ctx.openingStockRecorded === false && snap.onHand === 0) {
      mk('opening_stock_missing', 'helpful', 'open',
        `${snap.name} was added but has no opening stock recorded.`,
        `${snap.name} has no opening stock recorded.`);
    }
  }

  // Expiry — only where expiry data is recorded.
  if (snap.perishable) {
    if (snap.expiryDate) {
      const days = daysUntil(snap.expiryDate, ctx.now);
      if (days < 0) {
        mk('expired', 'urgent', dayBucket(days),
          `${snap.name} is recorded as expired.`, `${snap.name} is recorded as expired. Please review it.`);
      } else if (days <= cfg.expiringSoonDays) {
        mk('expiring_soon', 'important', dayBucket(days),
          `${snap.name} is recorded as expiring in about ${days} day(s). Please review it.`,
          `${snap.name} may expire soon. Please review it.`);
      }
    } else if (trackAvailability && snap.available > 0) {
      mk('expiry_missing', 'helpful', 'missing',
        `${snap.name} is perishable but has no expiry date recorded.`,
        `${snap.name} has no expiry date recorded.`);
    }
  }

  // Stock count overdue.
  if (typeof ctx.daysSinceStockCount === 'number' && ctx.daysSinceStockCount >= cfg.stockCountOverdueDays) {
    mk('stock_count_overdue', 'helpful', 'overdue',
      `${snap.name} has not had a stock count for ${ctx.daysSinceStockCount} days.`,
      `${snap.name} is overdue for a stock count.`);
  }

  // Pending sync (informational; never blocks).
  if (snap.pendingLocalMovements > 0) {
    mk('pending_sync', 'helpful', 'pending',
      `${snap.name} has ${snap.pendingLocalMovements} change(s) waiting to sync.`,
      `Some ${snap.name} changes are waiting to sync.`);
  }

  return out;
}

// Bucketing keeps a condition stable until it MEANINGFULLY changes (dedup), while
// letting a worsening condition (e.g. low → zero) produce a fresh alert.
function thresholdBucket(available: number, threshold: number): string {
  if (available <= 0) return 'zero';
  if (threshold <= 0) return 'lt-threshold';
  const ratio = available / threshold;
  return ratio <= 0.5 ? 'half' : 'near';
}
function dayBucket(days: number): string {
  if (days < 0) return 'expired';
  if (days === 0) return 'today';
  if (days <= 1) return 'd1';
  if (days <= 3) return 'd3';
  return 'd7';
}
function bucketOf(delta: number): string { return delta > 0 ? 'pos' : 'neg'; }

export function daysUntil(isoDate: string, nowMs: number): number {
  const target = Date.parse(isoDate);
  if (Number.isNaN(target)) return Number.POSITIVE_INFINITY;
  return Math.floor((target - nowMs) / (24 * 60 * 60 * 1000));
}
