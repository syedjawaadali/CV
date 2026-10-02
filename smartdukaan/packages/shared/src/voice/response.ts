/**
 * Spoken response builder (Phase 5) — pure. Turns a structured result into a
 * concise, privacy-aware line for TTS + a visual string. Never reads whole
 * screens aloud; in privacy mode, exact amounts/balances/customer names are
 * suppressed in the SPOKEN text (the visual UI still shows them after auth).
 */

export type ResponseMode = 'short' | 'standard' | 'detailed' | 'elderly';

export interface SpokenResponseInput {
  kind:
    | 'stock_qty' | 'low_stock' | 'today_sales' | 'today_expenses' | 'outstanding'
    | 'recent_added' | 'action_done' | 'action_pending_sync' | 'need_clarify'
    | 'not_found' | 'not_allowed' | 'preview' | 'summary' | 'error';
  productName?: string;
  quantity?: number;
  unit?: string;
  amountMajor?: number;
  count?: number;
  items?: string[];
  clarifyQuestion?: string;
  freshnessNote?: string;   // e.g. "2 offline sales still waiting to sync"
  previewText?: string;
  errorMessage?: string;
  language?: 'en' | 'ur' | 'roman_ur' | 'mixed';
}

export interface SpokenResponse { speech: string; display: string; sensitive: boolean }

const AMOUNT_HIDDEN_EN = 'the amount';
const AMOUNT_HIDDEN_UR = 'رقم';

function money(amountMajor: number | undefined, privacy: boolean, ur: boolean): string {
  if (amountMajor == null) return ur ? AMOUNT_HIDDEN_UR : AMOUNT_HIDDEN_EN;
  if (privacy) return ur ? AMOUNT_HIDDEN_UR : AMOUNT_HIDDEN_EN;
  return ur ? `${formatNum(amountMajor)} روپے` : `${formatNum(amountMajor)} rupees`;
}
function formatNum(n: number): string { return n.toLocaleString('en-PK'); }

export function buildSpokenResponse(
  input: SpokenResponseInput, opts?: { privacyMode?: boolean; mode?: ResponseMode },
): SpokenResponse {
  const privacy = opts?.privacyMode ?? false;
  const ur = input.language === 'ur' || input.language === 'mixed' || input.language === 'roman_ur';
  const detailed = opts?.mode === 'detailed';
  let speech = '';
  let sensitive = false;

  switch (input.kind) {
    case 'stock_qty':
      speech = ur
        ? `${input.productName ?? 'مصنوعات'} کے ${input.quantity ?? 0} ${input.unit ?? ''} باقی ہیں۔`
        : `${input.quantity ?? 0} ${input.unit ?? 'units'} of ${input.productName ?? 'the product'} are available.`;
      break;
    case 'low_stock':
      speech = (input.count ?? 0) === 0
        ? (ur ? 'کوئی چیز کم اسٹاک میں نہیں۔' : 'Nothing is low in stock.')
        : (ur ? `${input.count} چیزیں کم اسٹاک میں ہیں۔` : `${input.count} products are low in stock.`)
          + (input.items?.length ? (ur ? ` سب سے ضروری: ${input.items[0]}۔` : ` Most urgent: ${input.items[0]}.`) : '');
      break;
    case 'today_sales':
      sensitive = privacy;
      speech = ur
        ? `آج کی سیل ${money(input.amountMajor, privacy, true)} ہے۔`
        : `Today's recorded sales are ${money(input.amountMajor, privacy, false)}.`;
      break;
    case 'today_expenses':
      sensitive = privacy;
      speech = ur ? `آج کے اخراجات ${money(input.amountMajor, privacy, true)} ہیں۔`
        : `Today's expenses are ${money(input.amountMajor, privacy, false)}.`;
      break;
    case 'outstanding':
      sensitive = true;
      speech = privacy
        ? (ur ? `${input.count ?? 0} گاہکوں کا حساب باقی ہے۔ تفصیل کے لیے کھاتا کھولیں۔` : `${input.count ?? 0} customers have outstanding balances. Open khata to view details.`)
        : (ur ? `کل باقی ادھار ${money(input.amountMajor, false, true)} ہے۔` : `Total outstanding is ${money(input.amountMajor, false, false)}.`);
      break;
    case 'recent_added':
      speech = input.items?.length
        ? (ur ? `حال ہی میں شامل: ${listOf(input.items, true)}۔` : `You recently added ${listOf(input.items, false)}.`)
        : (ur ? 'حال ہی میں کچھ شامل نہیں ہوا۔' : 'Nothing was added recently.');
      break;
    case 'action_done':
      speech = input.previewText ?? (ur ? 'ہو گیا۔' : 'Done.');
      break;
    case 'action_pending_sync':
      speech = (input.previewText ? input.previewText + ' ' : '')
        + (ur ? 'یہ اس ڈیوائس پر محفوظ ہے اور سنک ہونے کا انتظار ہے۔' : 'This is saved on this device and is waiting to sync.');
      break;
    case 'need_clarify':
      speech = input.clarifyQuestion ?? (ur ? 'براہ کرم وضاحت کریں۔' : 'Please clarify.');
      break;
    case 'not_found':
      speech = ur ? 'یہ نہیں ملا۔ دوبارہ کہیں یا دستی تلاش کریں۔' : 'I could not find that. Try again or search manually.';
      break;
    case 'not_allowed':
      speech = ur ? 'آپ کو اس کی اجازت نہیں ہے۔' : 'You do not have permission for that.';
      break;
    case 'preview':
      speech = input.previewText ?? '';
      break;
    case 'summary':
      speech = input.previewText ?? '';
      sensitive = privacy;
      break;
    default:
      speech = input.errorMessage ?? (ur ? 'کچھ غلط ہو گیا۔' : 'Something went wrong.');
  }

  if (input.freshnessNote) {
    speech += ' ' + input.freshnessNote;
  }
  return { speech: speech.trim(), display: speech.trim(), sensitive };
}

function listOf(items: string[], ur: boolean): string {
  const top = items.slice(0, 3);
  if (top.length <= 1) return top[0] ?? '';
  const sep = ur ? '، ' : ', ';
  const and = ur ? ' اور ' : ' and ';
  return top.slice(0, -1).join(sep) + and + top[top.length - 1];
}
