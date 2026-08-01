import { describe, it, expect } from 'vitest';
import {
  classifyFreshness, classifyDataQuality, availableFrom, forecastEligible,
  type InventorySnapshot,
} from './snapshot.js';
import { evaluateRules, daysUntil } from './rules.js';
import { demandBaseline, projectStockout } from './forecast.js';
import { suggestReorder, DEFAULT_REORDER } from './reorder.js';
import { alertPriority, shouldResurface, dedupKey } from './priority.js';
import { buildSummary, genericAttentionLine } from './summary.js';

const NOW = Date.parse('2026-08-01T00:00:00Z');

function snap(over: Partial<InventorySnapshot> = {}): InventorySnapshot {
  return {
    productId: 'p1', name: 'Surf Excel', unit: 'packet', onHand: 5, reserved: 0, incoming: 0, damaged: 0,
    available: 5, lowStockThreshold: 3, reorderQty: null, perishable: false, expiryDate: null,
    importance: 'normal', intentionallyUnstocked: false, active: true, createdAt: '2026-01-01',
    lastSaleAt: null, lastPurchaseAt: null, lastMovementAt: null, lastStockCountAt: null,
    pendingLocalMovements: 0, hasConflict: false, freshness: 'current', dataQuality: 'good', ...over,
  };
}

describe('snapshot classifiers', () => {
  it('available never goes below zero', () => {
    expect(availableFrom(2, 5)).toBe(0);
    expect(availableFrom(10, 3)).toBe(7);
  });
  it('freshness: conflict > pending > stale > current', () => {
    expect(classifyFreshness({ onHand: 1, lowStockThreshold: 1, hasConflict: true })).toBe('conflicted');
    expect(classifyFreshness({ onHand: 1, lowStockThreshold: 1, pendingLocalMovements: 2 })).toBe('pending_local');
    expect(classifyFreshness({ onHand: 1, lowStockThreshold: 1, lastSyncAgeMs: 48 * 3600_000 })).toBe('stale');
    expect(classifyFreshness({ onHand: 1, lowStockThreshold: 1, lastSyncAgeMs: 0 })).toBe('current');
  });
  it('data quality: insufficient history blocks forecasting', () => {
    const q = classifyDataQuality({ onHand: 5, lowStockThreshold: 3, nonZeroSaleDays: 2, historyDays: 5, hasUnit: true, hasSellingPrice: true });
    expect(q).toBe('insufficient_for_forecast');
    expect(forecastEligible(q)).toBe(false);
  });
  it('data quality: good history is forecast-eligible', () => {
    const q = classifyDataQuality({ onHand: 5, lowStockThreshold: 3, nonZeroSaleDays: 10, historyDays: 20, hasUnit: true, hasSellingPrice: true });
    expect(q).toBe('good');
    expect(forecastEligible(q)).toBe(true);
  });
});

describe('deterministic rules', () => {
  const ctx = { now: NOW };
  it('out of stock at zero available', () => {
    const a = evaluateRules(snap({ onHand: 0, available: 0 }), ctx);
    expect(a.some((x) => x.type === 'out_of_stock' && x.severity === 'urgent')).toBe(true);
  });
  it('low stock at/below threshold', () => {
    const a = evaluateRules(snap({ onHand: 3, available: 3, lowStockThreshold: 3 }), ctx);
    expect(a.some((x) => x.type === 'low_stock' && x.severity === 'important')).toBe(true);
  });
  it('negative stock is a critical integrity alert', () => {
    const a = evaluateRules(snap({ onHand: -2, available: 0 }), ctx);
    expect(a.some((x) => x.type === 'negative_stock' && x.severity === 'critical')).toBe(true);
  });
  it('intentionally-unstocked products are not nagged for availability', () => {
    const a = evaluateRules(snap({ onHand: 0, available: 0, intentionallyUnstocked: true }), ctx);
    expect(a.some((x) => x.type === 'out_of_stock')).toBe(false);
  });
  it('large adjustment uses neutral, non-accusatory language', () => {
    const a = evaluateRules(snap(), { now: NOW, lastAdjustmentDelta: -500 });
    const la = a.find((x) => x.type === 'large_adjustment');
    expect(la).toBeTruthy();
    expect(la!.explanation.toLowerCase()).not.toMatch(/fraud|theft|stole|employee/);
  });
  it('expiry alerts only where expiry data exists', () => {
    const soon = evaluateRules(snap({ perishable: true, expiryDate: '2026-08-02' }), { now: NOW });
    expect(soon.some((x) => x.type === 'expiring_soon')).toBe(true);
    const missing = evaluateRules(snap({ perishable: true, expiryDate: null, available: 5 }), { now: NOW });
    expect(missing.some((x) => x.type === 'expiry_missing')).toBe(true);
  });
  it('daysUntil computes calendar days', () => {
    expect(daysUntil('2026-08-03T00:00:00Z', NOW)).toBe(2);
  });
});

describe('forecast', () => {
  it('skips forecasting when history is insufficient', () => {
    const b = demandBaseline([1, 0, 2]);
    expect(b.confidence).toBe('insufficient_data');
    const p = projectStockout(10, b);
    expect(p.daysRemaining).toBeNull();
    expect(p.estimate).toBe(true);
  });
  it('estimates days remaining for steady demand', () => {
    const series = new Array(20).fill(3); // 3/day for 20 days
    const b = demandBaseline(series);
    expect(b.confidence).toBe('high');
    expect(b.dailyDemand).toBeCloseTo(3, 1);
    const p = projectStockout(9, b);
    expect(p.daysRemaining).toBe(3);
    expect(p.explanation.toLowerCase()).toContain('about');
  });
  it('no recent sales => no stockout estimate', () => {
    const b = demandBaseline(new Array(20).fill(0));
    expect(projectStockout(5, b).daysRemaining).toBeNull();
  });
  it('weighted average weights recent days more', () => {
    const rising = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const b = demandBaseline(rising, 'weighted_average');
    const m = demandBaseline(rising, 'recent_average');
    expect(b.dailyDemand).toBeGreaterThan(m.dailyDemand);
  });
});

describe('reorder', () => {
  const steady = demandBaseline(new Array(20).fill(3));
  it('suggests a pack-rounded quantity covering coverage + lead time', () => {
    const r = suggestReorder({ available: 3, incoming: 0, leadTimeDays: 2, leadTimeSource: 'verified', baseline: steady, hasPendingOrder: false },
      { ...DEFAULT_REORDER, packSize: 24 });
    expect(r.suggested).toBe(true);
    expect(r.suggestedUnits % 24).toBe(0); // rounded to carton of 24
    expect(r.reason.toLowerCase()).toContain('per day');
  });
  it('a pending order suppresses the suggestion', () => {
    const r = suggestReorder({ available: 1, incoming: 0, leadTimeDays: 2, leadTimeSource: 'verified', baseline: steady, hasPendingOrder: true });
    expect(r.suggested).toBe(false);
    expect(r.reason.toLowerCase()).toContain('pending');
  });
  it('sufficient incoming stock suppresses the suggestion', () => {
    const r = suggestReorder({ available: 5, incoming: 100, leadTimeDays: 2, leadTimeSource: 'verified', baseline: steady, hasPendingOrder: false });
    expect(r.suggested).toBe(false);
  });
  it('insufficient history => no quantity, with a data warning', () => {
    const r = suggestReorder({ available: 2, incoming: 0, leadTimeDays: 1, leadTimeSource: 'unknown', baseline: demandBaseline([1, 0, 1]), hasPendingOrder: false });
    expect(r.suggested).toBe(false);
    expect(r.dataWarning).toBeTruthy();
  });
});

describe('priority + dedup', () => {
  it('critical outranks helpful; essential boosts', () => {
    expect(alertPriority({ severity: 'critical', importance: 'normal' }))
      .toBeGreaterThan(alertPriority({ severity: 'helpful', importance: 'essential' }));
  });
  it('does not resurface the same condition without a meaningful change', () => {
    const alert = { productId: 'p1', type: 'low_stock' as const, severity: 'important' as const, conditionKey: 'p1:low_stock:near', conditionVersion: '1', explanation: '', spokenHint: '' };
    expect(shouldResurface({ conditionKey: 'p1:low_stock:near', status: 'delivered' }, alert, NOW)).toBe(false);
    // low -> zero is a new bucket => resurface
    const worse = { ...alert, conditionKey: 'p1:out_of_stock:zero', type: 'out_of_stock' as const };
    expect(shouldResurface({ conditionKey: 'p1:low_stock:near', status: 'delivered' }, worse, NOW)).toBe(true);
  });
  it('a snooze re-surfaces only after it expires', () => {
    const alert = { productId: 'p1', type: 'low_stock' as const, severity: 'important' as const, conditionKey: 'k', conditionVersion: '1', explanation: '', spokenHint: '' };
    expect(shouldResurface({ conditionKey: 'k', status: 'snoozed', snoozedUntilMs: NOW + 1000 }, alert, NOW)).toBe(false);
    expect(shouldResurface({ conditionKey: 'k', status: 'snoozed', snoozedUntilMs: NOW - 1000 }, alert, NOW)).toBe(true);
  });
  it('dedup key is tenant+shop scoped', () => {
    const alert = { productId: 'p1', type: 'low_stock' as const, severity: 'important' as const, conditionKey: 'p1:low_stock:near', conditionVersion: '1', explanation: '', spokenHint: '' };
    expect(dedupKey('t1', 's1', alert)).not.toBe(dedupKey('t2', 's1', alert));
  });
});

describe('summary builder', () => {
  it('leads with most-urgent and offers read-all when there are more', () => {
    const s = buildSummary({ kind: 'needs_attention', outOfStock: 2, lowStock: 4, topUrgentNames: ['Surf Excel', 'Coke', 'Lux', 'Tea'], totalAttentionItems: 6 });
    expect(s.speech).toContain('Surf Excel');
    expect(s.hasMore).toBe(true);
    expect(s.speech.toLowerCase()).toContain('read all');
  });
  it('privacy mode hides exact sales in a closing summary', () => {
    const s = buildSummary({ kind: 'closing', outOfStock: 0, lowStock: 1, unitsSoldToday: 42, salesTodayMajor: 12500 }, { privacyMode: true });
    expect(s.speech).not.toContain('12,500');
    expect(s.sensitive).toBe(true);
  });
  it('generic attention line for locked/privacy contexts', () => {
    expect(genericAttentionLine(3).toLowerCase()).toContain('open smart dukaan');
    expect(genericAttentionLine(0).toLowerCase()).toContain('nothing');
  });
});
