/**
 * Deterministic voice intent classification + entity extraction (Phase 5).
 *
 * A controlled taxonomy — NOT an open chatbot. Keyword/pattern matching across
 * English, Roman Urdu and Urdu produces a structured IntentResult. There is NO
 * generative model here; an optional AI-assisted fallback (flagged off) may run
 * server-side only when this returns low confidence, and its output flows
 * through the SAME structured schema and the same permission/confirmation gates.
 *
 * The engine never executes anything — it only proposes. Ambiguous or missing
 * information is surfaced (missing/ambiguous) so the caller clarifies.
 */
import { PERMISSIONS, type Permission } from '../roles.js';
import { normalizeText } from '../normalize.js';
import { parseSpokenNumber, parseSpokenMoney, isNumberWord } from './numbers.js';
import { parseSpokenUnit, isKnownUnitWord, type CanonicalUnit } from './units.js';
import { detectLanguage, type VoiceLanguage } from './language.js';
import { confirmationLevelFor, type ConfirmationLevel } from './confirm.js';

export type VoiceDomain =
  | 'navigation' | 'product' | 'inventory' | 'sales' | 'khata' | 'expense' | 'report' | 'assistant';

export interface VoiceEntities {
  quantity?: number | null;
  unit?: CanonicalUnit | null;
  amountMajor?: number | null;
  productPhrase?: string | null;
  customerPhrase?: string | null;
  expenseCategory?: string | null;
  paymentMethod?: 'cash' | 'credit' | 'digital' | null;
  screen?: string | null;
  targetLanguage?: VoiceLanguage | null;
  newPrice?: number | null;
}

export interface IntentResult {
  intent: string;
  intentVersion: string;
  domain: VoiceDomain;
  confidence: number;
  transcript: string;
  normalizedTranscript: string;
  language: VoiceLanguage;
  entities: VoiceEntities;
  missing: string[];
  ambiguous: string[];
  requiredPermission: Permission | null;
  confirmationLevel: ConfirmationLevel;
  warnings: string[];
}

const INTENT_VERSION = '1';

interface Rule {
  intent: string;
  domain: VoiceDomain;
  permission: Permission | null;
  priority: number;     // tie-breaker; more specific/financial intents win over generic ones
  keywords: string[];   // any-match, normalized (lowercase, no diacritics for latin)
  needs?: Array<keyof VoiceEntities>;
}

// Keyword sets are matched against the normalized transcript. Final ranking is
// keywordScore*10 + priority, so a specific financial/report intent beats a
// generic verb like "add" when both match.
const RULES: Rule[] = [
  // Assistant control (highest priority).
  { intent: 'stop_speaking', domain: 'assistant', permission: null, priority: 100, keywords: ['stop speaking', 'stop', 'bas', 'band karo', 'بند', 'بس', 'chup'] },
  { intent: 'repeat', domain: 'assistant', permission: null, priority: 100, keywords: ['repeat', 'dobara', 'phir se', 'دوبارہ', 'repeat karo'] },
  { intent: 'cancel', domain: 'assistant', permission: null, priority: 100, keywords: ['cancel', 'mansookh', 'rehne do', 'chhod do', 'منسوخ', 'چھوڑ'] },
  { intent: 'help', domain: 'assistant', permission: null, priority: 95, keywords: ['help', 'madad', 'مدد', 'kaise', 'how do i'] },
  { intent: 'set_language', domain: 'assistant', permission: null, priority: 95, keywords: ['urdu bolo', 'english bolo', 'speak urdu', 'speak english', 'urdu mein', 'اردو میں'] },
  { intent: 'hide_amounts', domain: 'assistant', permission: null, priority: 95, keywords: ['hide amount', 'privacy mode', 'chupao', 'raqam chupao'] },

  // Reports / read-only (before record-changing so "today's sales" doesn't hit sale).
  { intent: 'ask_today_sales', domain: 'report', permission: PERMISSIONS.SALE_VIEW, priority: 82, keywords: ['today sale', 'todays sale', 'aaj ki sale', 'aaj kitni sale', 'kitni sale hui', 'آج کتنی سیل', 'aaj sale'] },
  { intent: 'ask_today_expenses', domain: 'report', permission: PERMISSIONS.EXPENSE_MANAGE, priority: 82, keywords: ['today expense', 'todays expense', 'aaj ka kharcha', 'kitna kharcha', 'آج کا خرچہ'] },
  { intent: 'ask_outstanding', domain: 'report', permission: PERMISSIONS.KHATA_VIEW, priority: 82, keywords: ['outstanding', 'total udhaar', 'kitna udhaar', 'who owes', 'sab ka khata', 'کل ادھار', 'baqi'] },
  { intent: 'ask_low_stock', domain: 'inventory', permission: PERMISSIONS.INVENTORY_VIEW, priority: 82, keywords: ['low stock', 'kam stock', 'kya khatam', 'finished', 'out of stock', 'کم اسٹاک', 'khatam ho'] },
  { intent: 'ask_recent_added', domain: 'product', permission: PERMISSIONS.PRODUCT_VIEW, priority: 82, keywords: ['recently added', 'added recently', 'recently', 'kya add kiya', 'recent products', 'abhi kya', 'حال ہی میں شامل', 'kya daala', 'what i added'] },
  { intent: 'ask_recent_sold', domain: 'report', permission: PERMISSIONS.SALE_VIEW, priority: 80, keywords: ['recently sold', 'kya bika', 'kya becha', 'حال ہی میں فروخت'] },
  { intent: 'read_summary', domain: 'report', permission: PERMISSIONS.REPORT_VIEW, priority: 80, keywords: ['summary', 'business summary', 'aaj ka hisab', 'today summary', 'خلاصہ', 'hisaab'] },
  { intent: 'ask_customer_balance', domain: 'khata', permission: PERMISSIONS.KHATA_VIEW, priority: 78, keywords: ['balance', 'kitna dena', 'kitna baqi', 'owe', 'ke khate mein kitna', 'kitna owe'] },

  // Khata (financial — must beat the generic "add" verb).
  { intent: 'khata_payment', domain: 'khata', permission: PERMISSIONS.KHATA_MANAGE, priority: 72, keywords: ['payment', 'wasool', 'received', 'paisay mile', 'wasool hue', 'ada kiya', 'وصول', 'jama karaya'], needs: ['customerPhrase', 'amountMajor'] },
  { intent: 'khata_credit', domain: 'khata', permission: PERMISSIONS.KHATA_MANAGE, priority: 70, keywords: ['khate mein', 'khate', 'udhaar', 'credit', 'کھاتے میں', 'کھاتے', 'ادھار', 'likh do'], needs: ['customerPhrase', 'amountMajor'] },

  // Expense.
  { intent: 'record_expense', domain: 'expense', permission: PERMISSIONS.EXPENSE_MANAGE, priority: 68, keywords: ['expense', 'kharcha', 'kharch', 'bill', 'خرچہ', 'kharcha likho'], needs: ['expenseCategory', 'amountMajor'] },

  // Sales.
  { intent: 'record_sale', domain: 'sales', permission: PERMISSIONS.SALE_CREATE, priority: 66, keywords: ['sale', 'sell', 'becho', 'bech do', 'sale karo', 'cash sale', 'فروخت', 'sale likho'], needs: ['amountMajor'] },

  // Price update.
  { intent: 'update_price', domain: 'product', permission: PERMISSIONS.PRODUCT_MANAGE, priority: 64, keywords: ['price', 'price change', 'change price', 'price karo', 'qeemat', 'rate change', 'price update', 'قیمت', 'rate'], needs: ['productPhrase', 'newPrice'] },

  // Product create/search.
  { intent: 'add_product', domain: 'product', permission: PERMISSIONS.PRODUCT_MANAGE, priority: 60, keywords: ['new product', 'add product', 'nayi product', 'product banao', 'نئی مصنوعات'], needs: ['productPhrase'] },
  { intent: 'search_product', domain: 'product', permission: PERMISSIONS.PRODUCT_VIEW, priority: 42, keywords: ['search', 'find product', 'dhoondo', 'talash', 'تلاش', 'product dhundo'], needs: ['productPhrase'] },

  // Inventory / stock changes.
  { intent: 'add_stock', domain: 'inventory', permission: PERMISSIONS.INVENTORY_MANAGE, priority: 55, keywords: ['add stock', 'stock add', 'add karo', 'add', 'refill', 'stock barhao', 'شامل کرو', 'شامل', 'stock daalo', 'receive'], needs: ['productPhrase', 'quantity'] },
  { intent: 'check_stock', domain: 'inventory', permission: PERMISSIONS.INVENTORY_VIEW, priority: 50, keywords: ['stock kitna', 'kitne bache', 'kitna stock', 'how many', 'how much stock', 'kitne left', 'stock check', 'کتنے باقی', 'kitne hain'], needs: ['productPhrase'] },

  // Navigation.
  { intent: 'open_screen', domain: 'navigation', permission: null, priority: 45, keywords: ['open', 'kholo', 'go to', 'dikhao', 'کھولو'], needs: ['screen'] },
];

const SCREENS: Record<string, string> = {
  home: 'home', dashboard: 'home', products: 'products', product: 'products', inventory: 'inventory',
  stock: 'inventory', khata: 'khata', udhaar: 'khata', sales: 'sales', sale: 'sales', expense: 'expenses',
  expenses: 'expenses', kharcha: 'expenses', report: 'reports', reports: 'reports', scanner: 'scan', scan: 'scan',
};

const EXPENSE_CATEGORIES: Record<string, string> = {
  electricity: 'Electricity', bijli: 'Electricity', بجلی: 'Electricity',
  rent: 'Rent', kiraya: 'Rent', کرایہ: 'Rent',
  salary: 'Salary', tankhwah: 'Salary', تنخواہ: 'Salary',
  water: 'Water', pani: 'Water', پانی: 'Water',
  gas: 'Gas', گیس: 'Gas',
  transport: 'Transport', kiraya_gari: 'Transport',
  misc: 'Miscellaneous', other: 'Miscellaneous',
};

const INTENT_STOPWORDS = new Set([
  'add', 'stock', 'karo', 'kar', 'do', 'ka', 'ke', 'ki', 'ko', 'mein', 'me', 'sale', 'sell', 'becho',
  'change', 'price', 'expense', 'kharcha', 'ke', 'khate', 'udhaar', 'credit', 'payment', 'wasool',
  'the', 'to', 'of', 'a', 'please', 'kitna', 'kitne', 'kitni', 'how', 'many', 'much', 'left', 'hai', 'hain',
  'open', 'kholo', 'search', 'find', 'new', 'product', 'rupay', 'rupees', 'rs', 'pkr', 'روپے',
]);

/**
 * Interpret a raw transcript into a structured, non-executable IntentResult.
 */
export function interpretTranscript(
  transcript: string, opts?: { highRiskAmount?: number; expenseCategories?: string[] },
): IntentResult {
  const lang = detectLanguage(transcript);
  const norm = normalizeText(transcript); // lowercase, collapse spaces, strip diacritics for latin
  const lower = ` ${norm} `;

  // Score each rule by matched keywords (longer phrases score higher), then rank
  // by keywordScore*10 + rule.priority so specific/financial intents win ties.
  let best: { rule: Rule; score: number; rank: number } | null = null;
  for (const rule of RULES) {
    let score = 0;
    for (const kw of rule.keywords) {
      const k = normalizeText(kw);
      if (k && lower.includes(` ${k} `)) score += 1 + Math.min(2, k.split(' ').length - 1);
      else if (k && lower.includes(k)) score += 1;
    }
    if (score > 0) {
      const rank = score * 10 + rule.priority;
      if (!best || rank > best.rank) best = { rule, score, rank };
    }
  }

  const entities = extractEntities(transcript, norm, opts?.expenseCategories);

  if (!best) {
    return {
      intent: 'unknown', intentVersion: INTENT_VERSION, domain: 'assistant', confidence: 0,
      transcript, normalizedTranscript: norm, language: lang.primary, entities,
      missing: [], ambiguous: [], requiredPermission: null, confirmationLevel: 'none',
      warnings: ['no intent matched'],
    };
  }

  const rule = best.rule;
  // Confidence scales with keyword score, capped; entity presence nudges it up.
  let confidence = Math.min(0.95, 0.4 + best.score * 0.15);

  // Resolve screen / language entities for specific intents.
  if (rule.intent === 'open_screen') entities.screen = resolveScreen(norm);
  if (rule.intent === 'set_language') entities.targetLanguage = /urdu|اردو/.test(norm) ? 'ur' : 'en';

  // Missing / ambiguous required entities.
  const missing: string[] = [];
  const ambiguous: string[] = [];
  for (const need of rule.needs ?? []) {
    const v = entities[need];
    if (v == null || v === '') missing.push(String(need));
  }
  if ((rule.intent === 'add_stock' || rule.intent === 'check_stock' || rule.intent === 'update_price') && !entities.productPhrase) {
    if (!missing.includes('productPhrase')) missing.push('productPhrase');
  }

  const amountMajor = entities.amountMajor ?? entities.newPrice ?? null;
  const confirmationLevel = confirmationLevelFor(rule.intent, { amountMajor, highRiskAmount: opts?.highRiskAmount });

  if (missing.length > 0) confidence = Math.min(confidence, 0.6);

  return {
    intent: rule.intent, intentVersion: INTENT_VERSION, domain: rule.domain, confidence,
    transcript, normalizedTranscript: norm, language: lang.primary, entities,
    missing, ambiguous, requiredPermission: rule.permission, confirmationLevel,
    warnings: lang.warnings,
  };
}

function extractEntities(raw: string, norm: string, shopCategories?: string[]): VoiceEntities {
  const e: VoiceEntities = {};
  const qty = parseSpokenNumber(raw);
  const unit = parseSpokenUnit(raw);
  const money = parseSpokenMoney(raw);

  if (unit.unit) e.unit = unit.unit;
  // A quantity only counts if a unit or an explicit count context exists; keep it available.
  if (qty.value != null) e.quantity = qty.value;

  // Amount vs price: a "price"/"qeemat" context routes the number to newPrice.
  if (/price|qeemat|rate|قیمت/.test(norm)) {
    if (money.amountMajor != null) e.newPrice = money.amountMajor;
  } else if (money.amountMajor != null && /rupay|rupees|rs|pkr|روپے|sale|kharcha|expense|khata|khate|کھاتے|udhaar|payment|wasool|credit|likho|likh/.test(norm)) {
    e.amountMajor = money.amountMajor;
  }

  e.paymentMethod = detectPayment(norm);
  e.expenseCategory = detectExpenseCategory(norm, shopCategories);
  e.customerPhrase = detectCustomerPhrase(norm);
  e.productPhrase = detectProductPhrase(norm);
  return e;
}

function detectPayment(norm: string): 'cash' | 'credit' | 'digital' | null {
  if (/credit|udhaar|udhar|khata|khate|ادھار|کھاتے/.test(norm)) return 'credit';
  if (/digital|easypaisa|jazzcash|online|transfer|bank/.test(norm)) return 'digital';
  if (/cash|naqad|نقد/.test(norm)) return 'cash';
  return null;
}

function detectExpenseCategory(norm: string, shopCategories?: string[]): string | null {
  for (const [k, v] of Object.entries(EXPENSE_CATEGORIES)) {
    if (norm.includes(normalizeText(k))) return v;
  }
  if (shopCategories) {
    for (const c of shopCategories) if (norm.includes(normalizeText(c))) return c;
  }
  return null;
}

function detectCustomerPhrase(norm: string): string | null {
  // "<name> ke khate", "<name> se", "<name> owes", "to <name>"
  const m = norm.match(/([a-z؀-ۿ]+)\s+(?:ke khate|ke khata|se|ka udhaar|owes|owe)/);
  if (m) return capitalize(m[1]!);
  const m2 = norm.match(/(?:khate mein|for|to)\s+([a-z؀-ۿ]+)/);
  if (m2 && !SCREENS[m2[1]!]) return capitalize(m2[1]!);
  return null;
}

function detectProductPhrase(norm: string): string | null {
  // Remove numbers, units, currency and intent stopwords; the remainder is the
  // product phrase. Keep brand-like latin/urdu tokens.
  const tokens = norm.split(/[\s,]+/).filter(Boolean);
  const kept = tokens.filter((t) => {
    if (INTENT_STOPWORDS.has(t)) return false;
    if (isKnownUnitWord(t)) return false;
    if (isNumberWord(t)) return false; // strips digits + EN/Roman/Urdu number words
    return true;
  });
  const phrase = kept.join(' ').trim();
  return phrase.length >= 2 ? phrase : null;
}

function resolveScreen(norm: string): string | null {
  for (const [k, v] of Object.entries(SCREENS)) if (norm.includes(k)) return v;
  return null;
}

function capitalize(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1); }
