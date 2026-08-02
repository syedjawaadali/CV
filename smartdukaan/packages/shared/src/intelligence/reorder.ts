/**
 * Explainable reorder suggestions (Phase 6) — pure, deterministic. Computes a
 * suggested quantity from target coverage, forecast demand, current available,
 * incoming stock, safety stock, pack size and minimum order — and explains it.
 * It NEVER places an order; the retailer confirms and the existing purchase
 * workflow does the rest.
 */
import type { DemandBaseline } from './forecast.js';

export type SafetyBuffer = 'low' | 'standard' | 'extra';

export interface ReorderConfig {
  targetCoverageDays: number;    // how many days of stock to aim for
  safetyBuffer: SafetyBuffer;
  packSize: number;              // units per orderable pack (1 = individual)
  minOrderQty: number;           // minimum orderable quantity (in packs)
  maxOrderQty: number | null;    // retailer cap (in units), null = none
}

export const DEFAULT_REORDER: ReorderConfig = {
  targetCoverageDays: 7, safetyBuffer: 'standard', packSize: 1, minOrderQty: 0, maxOrderQty: null,
};

const SAFETY_FACTOR: Record<SafetyBuffer, number> = { low: 0.1, standard: 0.25, extra: 0.5 };

export interface ReorderInputs {
  available: number;
  incoming: number;             // already on the way (subtracted from need)
  leadTimeDays: number;         // supplier lead time
  leadTimeSource: 'verified' | 'partner' | 'estimated' | 'unknown';
  baseline: DemandBaseline;
  hasPendingOrder: boolean;     // an existing draft/order covers this product
}

export interface ReorderSuggestion {
  suggested: boolean;
  suggestedUnits: number;       // whole units, pack-rounded
  suggestedPacks: number | null;
  daysRemaining: number | null;
  reason: string;
  confidence: string;
  dataWarning: string | null;
  leadTimeSource: string;
  incoming: number;
}

/**
 * Suggested units ≈ demand over (coverage + lead time) + safety stock − available − incoming,
 * rounded UP to the pack size and to the minimum order, then capped.
 */
export function suggestReorder(inp: ReorderInputs, cfg: ReorderConfig = DEFAULT_REORDER): ReorderSuggestion {
  const noSuggestion = (reason: string): ReorderSuggestion => ({
    suggested: false, suggestedUnits: 0, suggestedPacks: null, daysRemaining: null,
    reason, confidence: inp.baseline.confidence, dataWarning: null,
    leadTimeSource: inp.leadTimeSource, incoming: inp.incoming,
  });

  if (inp.hasPendingOrder) return noSuggestion('A pending order already covers this product.');
  if (inp.baseline.confidence === 'insufficient_data') {
    return { ...noSuggestion('Not enough sales history to suggest a quantity yet.'), dataWarning: 'insufficient sales history' };
  }
  const demand = inp.baseline.dailyDemand;
  if (demand <= 0) return noSuggestion('No recent sales, so no reorder is suggested.');

  const horizonDays = cfg.targetCoverageDays + Math.max(0, inp.leadTimeDays);
  const targetStock = demand * horizonDays;
  const safety = targetStock * SAFETY_FACTOR[cfg.safetyBuffer];
  const rawNeed = targetStock + safety - inp.available - inp.incoming;
  if (rawNeed <= 0) return noSuggestion('Current and incoming stock already cover the target period.');

  // Round up to pack size, then enforce the minimum order (in packs), then cap.
  const pack = Math.max(1, cfg.packSize);
  let packs = Math.ceil(rawNeed / pack);
  if (cfg.minOrderQty > 0) packs = Math.max(packs, cfg.minOrderQty);
  let units = packs * pack;
  if (cfg.maxOrderQty != null && units > cfg.maxOrderQty) {
    units = Math.floor(cfg.maxOrderQty / pack) * pack;
    packs = units / pack;
  }
  const daysRemaining = Math.floor(inp.available / demand);

  const leadNote = inp.leadTimeSource === 'unknown' ? ''
    : ` Supplier delivery usually takes about ${inp.leadTimeDays} day(s) (${inp.leadTimeSource}).`;
  const reason = `${inp.available} available, recent sales average about ${round2(demand)} per day.` + leadNote
    + ` Suggested to cover ${cfg.targetCoverageDays} day(s) plus a ${cfg.safetyBuffer} buffer.`;

  return {
    suggested: true,
    suggestedUnits: units,
    suggestedPacks: pack > 1 ? packs : null,
    daysRemaining,
    reason,
    confidence: inp.baseline.confidence,
    dataWarning: inp.baseline.limitations.length ? inp.baseline.limitations.join('; ') : null,
    leadTimeSource: inp.leadTimeSource,
    incoming: inp.incoming,
  };
}

function round2(n: number): number { return Math.round(n * 100) / 100; }
