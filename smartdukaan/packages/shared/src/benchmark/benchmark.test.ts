/**
 * Deterministic-engine benchmark (Phase 9). Computes ACTUAL accuracy metrics for
 * the deterministic layers over labelled synthetic fixtures — these numbers are
 * executed, not invented. Speech-transcription, OCR-on-device and real-cloud
 * accuracy are NOT covered here (they need real media/devices/providers) and are
 * reported as pending in the pilot docs.
 *
 * The suite also enforces the top safety metric: ZERO incorrect high-confidence
 * outcomes on contradiction fixtures.
 */
import { describe, it, expect } from 'vitest';
import { interpretTranscript } from '../voice/intent.js';
import { parseSpokenNumber } from '../voice/numbers.js';
import { scoreCandidate, confidenceCategory, type CandidateEvidence } from '../scoring.js';
import { evaluateRules } from '../intelligence/rules.js';
import type { InventorySnapshot } from '../intelligence/snapshot.js';

function pct(hits: number, total: number): number { return total ? Math.round((hits / total) * 1000) / 10 : 0; }

// --- Intent classification fixtures (EN / Roman Urdu / Urdu / mixed) ---------
const INTENT_FIXTURES: Array<{ t: string; intent: string }> = [
  { t: 'Add ten Surf Excel packets', intent: 'add_stock' },
  { t: 'Surf Excel ke das packet add karo', intent: 'add_stock' },
  { t: 'سرف ایکسل کے دس پیکٹ شامل کریں', intent: 'add_stock' },
  { t: 'Coke ka stock kitna hai', intent: 'check_stock' },
  { t: 'How many Lux soaps are left', intent: 'check_stock' },
  { t: 'Aaj kitni sale hui', intent: 'ask_today_sales' },
  { t: "what are today's expenses", intent: 'ask_today_expenses' },
  { t: 'Imran ke khate mein five hundred add karo', intent: 'khata_credit' },
  { t: 'Bijli ka kharcha five thousand likho', intent: 'record_expense' },
  { t: 'Change Coke price to two hundred', intent: 'update_price' },
  { t: 'Record a cash sale of fifteen hundred rupees', intent: 'record_sale' },
  { t: 'what should I order', intent: 'ask_reorder' },
  { t: 'what is low in stock', intent: 'ask_low_stock' },
  { t: 'Tell me what I added recently', intent: 'ask_recent_added' },
  { t: 'Open khata', intent: 'open_screen' },
  { t: 'repeat', intent: 'repeat' },
];

// --- Number-parsing fixtures -------------------------------------------------
const NUMBER_FIXTURES: Array<{ t: string; v: number }> = [
  { t: 'ten', v: 10 }, { t: 'das', v: 10 }, { t: 'panch sau', v: 500 }, { t: 'do hazar', v: 2000 },
  { t: 'ek sau bees', v: 120 }, { t: 'dedh', v: 1.5 }, { t: 'sawa do', v: 2.25 }, { t: 'پانچ سو', v: 500 },
  { t: '۱۰', v: 10 }, { t: 'fifteen hundred', v: 1500 },
];

describe('Phase 9 benchmark — deterministic engine accuracy (executed)', () => {
  it('intent classification accuracy ≥ 90% on the labelled set', () => {
    let hits = 0;
    const misses: string[] = [];
    for (const f of INTENT_FIXTURES) {
      const got = interpretTranscript(f.t).intent;
      if (got === f.intent) hits++; else misses.push(`"${f.t}" → ${got} (want ${f.intent})`);
    }
    const acc = pct(hits, INTENT_FIXTURES.length);
    // eslint-disable-next-line no-console
    console.log(`[benchmark] intent accuracy = ${acc}% (${hits}/${INTENT_FIXTURES.length})`, misses.length ? misses : '');
    expect(acc).toBeGreaterThanOrEqual(90);
  });

  it('number parsing accuracy = 100% on the labelled set', () => {
    let hits = 0;
    for (const f of NUMBER_FIXTURES) if (parseSpokenNumber(f.t).value === f.v) hits++;
    const acc = pct(hits, NUMBER_FIXTURES.length);
    // eslint-disable-next-line no-console
    console.log(`[benchmark] number-parse accuracy = ${acc}% (${hits}/${NUMBER_FIXTURES.length})`);
    expect(acc).toBe(100);
  });

  it('SAFETY: zero incorrect high-confidence outcomes on contradiction fixtures', () => {
    const contradictions: CandidateEvidence[] = [
      { barcode: 'retailer_exact', packSizeContradiction: true },
      { barcode: 'shared_verified', brandContradiction: true },
      { barcode: 'shared_verified', variantContradiction: true },
      { barcode: 'conflict' },
      { barcode: 'retailer_exact', locallyRejected: true, packSizeContradiction: true },
    ];
    let falseHighConfidence = 0;
    for (const ev of contradictions) {
      const cat = confidenceCategory(scoreCandidate(ev), ev);
      if (cat === 'exact' || cat === 'high') falseHighConfidence++;
    }
    // eslint-disable-next-line no-console
    console.log(`[benchmark] false high-confidence rate = ${falseHighConfidence}/${contradictions.length}`);
    expect(falseHighConfidence).toBe(0);
  });

  it('low-stock / out-of-stock alert precision = 100% on labelled snapshots', () => {
    const now = Date.parse('2026-08-01T00:00:00Z');
    const base = (over: Partial<InventorySnapshot>): InventorySnapshot => ({
      productId: 'p', name: 'X', unit: 'packet', onHand: 5, reserved: 0, incoming: 0, damaged: 0,
      available: 5, lowStockThreshold: 3, reorderQty: null, perishable: false, expiryDate: null,
      importance: 'normal', intentionallyUnstocked: false, active: true, createdAt: '2026-01-01',
      lastSaleAt: null, lastPurchaseAt: null, lastMovementAt: null, lastStockCountAt: null,
      pendingLocalMovements: 0, hasConflict: false, freshness: 'current', dataQuality: 'good', ...over,
    });
    const cases: Array<{ snap: InventorySnapshot; expect: 'out_of_stock' | 'low_stock' | 'none' }> = [
      { snap: base({ onHand: 0, available: 0 }), expect: 'out_of_stock' },
      { snap: base({ onHand: 2, available: 2, lowStockThreshold: 3 }), expect: 'low_stock' },
      { snap: base({ onHand: 10, available: 10, lowStockThreshold: 3 }), expect: 'none' },
      { snap: base({ onHand: 0, available: 0, intentionallyUnstocked: true }), expect: 'none' },
    ];
    let hits = 0;
    for (const c of cases) {
      const types = new Set(evaluateRules(c.snap, { now }).map((a) => a.type));
      const ok = c.expect === 'none' ? (!types.has('out_of_stock') && !types.has('low_stock')) : types.has(c.expect);
      if (ok) hits++;
    }
    // eslint-disable-next-line no-console
    console.log(`[benchmark] deterministic alert precision = ${pct(hits, cases.length)}% (${hits}/${cases.length})`);
    expect(hits).toBe(cases.length);
  });
});
