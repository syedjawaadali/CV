/**
 * Spoken/visual business-summary builder (Phase 6) — pure, privacy-aware.
 * Produces a concise summary (most-urgent first) with a read-all control, and
 * suppresses sensitive amounts in privacy mode. Never reads long lists aloud.
 */

export type SummaryMode = 'short' | 'standard' | 'detailed' | 'elderly';

export interface SummaryInput {
  kind: 'opening' | 'closing' | 'on_demand' | 'needs_attention';
  outOfStock: number;
  lowStock: number;
  expiringSoon?: number;
  incomingDeliveries?: number;
  pendingSync?: number;
  conflicts?: number;
  unitsSoldToday?: number;
  refilledToday?: number;
  salesTodayMajor?: number | null;
  expensesTodayMajor?: number | null;
  topUrgentNames?: string[];   // most-urgent product names, ordered
  totalAttentionItems?: number;
  language?: 'en' | 'ur' | 'roman_ur' | 'mixed';
}

export interface BuiltSummary { speech: string; display: string; hasMore: boolean; sensitive: boolean }

const MAX_SPOKEN_ITEMS = 3;

export function buildSummary(input: SummaryInput, opts?: { privacyMode?: boolean; mode?: SummaryMode }): BuiltSummary {
  const ur = input.language === 'ur' || input.language === 'mixed' || input.language === 'roman_ur';
  const privacy = opts?.privacyMode ?? false;
  const parts: string[] = [];
  let sensitive = false;

  if (input.kind === 'opening') parts.push(ur ? 'صبح بخیر۔' : 'Good morning.');

  // 1) Most urgent state.
  if (input.conflicts && input.conflicts > 0) {
    parts.push(ur ? `${input.conflicts} مصنوعات میں اسٹاک کا ٹکراؤ ہے۔` : `${input.conflicts} product(s) have a stock conflict to review.`);
  }
  const oos = input.outOfStock, low = input.lowStock;
  if (oos > 0 || low > 0) {
    parts.push(ur
      ? `${oos} چیزیں ختم اور ${low} کم اسٹاک میں ہیں۔`
      : `${oos} product(s) are out of stock and ${low} are low.`);
  } else if (input.kind !== 'closing') {
    parts.push(ur ? 'اسٹاک ٹھیک ہے۔' : 'Stock levels look fine.');
  }

  // 2) Expiry / incoming.
  if (input.expiringSoon && input.expiringSoon > 0) {
    parts.push(ur ? `${input.expiringSoon} چیزیں جلد ختم ہو سکتی ہیں۔` : `${input.expiringSoon} product(s) may be expiring soon.`);
  }
  if (input.incomingDeliveries && input.incomingDeliveries > 0) {
    parts.push(ur ? `${input.incomingDeliveries} ترسیل متوقع ہے۔` : `${input.incomingDeliveries} delivery/deliveries expected.`);
  }

  // 3) Recent activity (closing summary or on-demand).
  if (input.kind === 'closing') {
    if (input.unitsSoldToday != null) parts.push(ur ? `آج ${input.unitsSoldToday} یونٹ فروخت ہوئے۔` : `${input.unitsSoldToday} product units were recorded as sold today.`);
    if (input.refilledToday != null && input.refilledToday > 0) parts.push(ur ? `${input.refilledToday} چیزیں دوبارہ بھری گئیں۔` : `${input.refilledToday} product(s) were refilled.`);
    if (!privacy && input.salesTodayMajor != null) {
      parts.push(ur ? `آج کی سیل ${formatNum(input.salesTodayMajor)} روپے۔` : `Today's recorded sales are ${formatNum(input.salesTodayMajor)} rupees.`);
    } else if (privacy && input.salesTodayMajor != null) {
      sensitive = true;
    }
  }

  // 4) Top urgent names (bounded) + read-all control.
  const names = input.topUrgentNames ?? [];
  const total = input.totalAttentionItems ?? (oos + low);
  let hasMore = false;
  if (names.length > 0) {
    const shown = names.slice(0, MAX_SPOKEN_ITEMS);
    hasMore = total > shown.length;
    parts.push(ur
      ? `سب سے پہلے: ${listOf(shown, true)}۔`
      : `Most urgent: ${listOf(shown, false)}.`);
    if (hasMore) parts.push(ur ? `مکمل فہرست کے لیے ”سب پڑھو“ کہیں۔` : `Say "read all" for the complete list.`);
  }

  // 5) Freshness / pending sync.
  if (input.pendingSync && input.pendingSync > 0) {
    parts.push(ur ? `${input.pendingSync} تبدیلیاں سنک کا انتظار کر رہی ہیں۔` : `${input.pendingSync} change(s) are still waiting to sync.`);
  }

  const speech = parts.join(' ').trim();
  return { speech, display: speech, hasMore, sensitive };
}

/** Privacy-safe generic line for locked/privacy contexts. */
export function genericAttentionLine(count: number, ur = false): string {
  if (count <= 0) return ur ? 'کوئی خاص توجہ درکار نہیں۔' : 'Nothing needs attention right now.';
  return ur ? 'کچھ مصنوعات کو توجہ درکار ہے۔ تفصیل کے لیے سمارٹ دکان کھولیں۔'
    : 'Some products need attention. Open Smart Dukaan to review them.';
}

function listOf(items: string[], ur: boolean): string {
  if (items.length <= 1) return items[0] ?? '';
  const sep = ur ? '، ' : ', ';
  const and = ur ? ' اور ' : ' and ';
  return items.slice(0, -1).join(sep) + and + items[items.length - 1];
}
function formatNum(n: number): string { return n.toLocaleString('en-PK'); }
