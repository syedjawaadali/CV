/**
 * Confirmation / cancellation detection + confirmation policy (Phase 5) — pure.
 * Multilingual affirmation and cancellation words. A confirmation is only valid
 * against an active proposed action (enforced server-side), never a bare "yes"
 * against stale context.
 */

export type ConfirmSignal = 'confirm' | 'cancel' | 'none';

const CONFIRM_WORDS = new Set([
  'yes', 'yeah', 'yep', 'confirm', 'confirmed', 'ok', 'okay', 'okey', 'do', 'doit', 'go', 'sure', 'proceed',
  'haan', 'han', 'hanji', 'ji', 'jee', 'theek', 'thik', 'theekhai', 'kardo', 'krdo', 'kardein', 'krdein',
  'ہاں', 'جی', 'ٹھیک', 'کردو', 'کردیں', 'ٹھیکہے',
]);
const CANCEL_WORDS = new Set([
  'no', 'nope', 'cancel', 'stop', 'abort', 'nevermind',
  'nahi', 'nahin', 'nai', 'rehne', 'rehnedo', 'chhodo', 'chhoro', 'chorho', 'band', 'bandkaro', 'bas',
  'نہیں', 'منسوخ', 'چھوڑ', 'چھوڑدیں', 'رہنے', 'بند', 'بس',
]);

function tokens(input: string): string[] {
  return input.toLowerCase().replace(/\s+/g, ' ').trim()
    // collapse "theek hai" -> "theekhai", "kar do" -> "kardo" for matching
    .replace(/\btheek hai\b/g, 'theekhai').replace(/\bkar do\b/g, 'kardo')
    .replace(/\bhan ji\b/g, 'hanji').replace(/\bband karo\b/g, 'bandkaro')
    .replace(/\brehne do\b/g, 'rehnedo')
    .split(/[\s,]+/).filter(Boolean);
}

export function detectConfirmation(input: string): ConfirmSignal {
  const ts = tokens(input);
  // Cancellation takes precedence (a "no, cancel" must never be read as yes).
  if (ts.some((t) => CANCEL_WORDS.has(t))) return 'cancel';
  if (ts.some((t) => CONFIRM_WORDS.has(t))) return 'confirm';
  return 'none';
}

/** Detect a stop-speaking request (interrupt TTS). */
export function detectStopSpeaking(input: string): boolean {
  const ts = tokens(input);
  return ts.some((t) => t === 'stop' || t === 'bas' || t === 'بس' || t === 'bandkaro' || t === 'بند');
}

export type ConfirmationLevel = 'none' | 'light' | 'standard' | 'strong';

/** How much confirmation an intent needs before execution (centralized policy). */
export function confirmationLevelFor(intent: string, opts?: { amountMajor?: number | null; highRiskAmount?: number }): ConfirmationLevel {
  const highRisk = opts?.highRiskAmount ?? 50_000; // PKR 50,000 default strong-confirm threshold
  const READ_ONLY = new Set([
    'open_screen', 'search_product', 'check_stock', 'ask_low_stock', 'ask_out_of_stock',
    'ask_recent_added', 'ask_recent_sold', 'ask_recent_refilled', 'ask_today_sales',
    'ask_today_expenses', 'ask_outstanding', 'ask_inventory_summary', 'ask_customer_balance',
    'read_summary', 'repeat', 'stop_speaking', 'help', 'set_language', 'hide_amounts', 'cancel',
  ]);
  const STRONG = new Set([
    'adjust_stock', 'reverse_sale', 'reverse_payment', 'deactivate_product', 'update_price',
  ]);
  if (READ_ONLY.has(intent)) return intent === 'set_language' ? 'light' : 'none';
  if (STRONG.has(intent)) return 'strong';
  if (opts?.amountMajor != null && opts.amountMajor >= highRisk) return 'strong';
  // Everything that changes records (add stock, sale, khata, expense, create product, payment).
  return 'standard';
}
