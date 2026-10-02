import { collapseSpaces, normalizeText } from './normalize.js';
import { parsePackSize, type ParsedPackSize } from './packsize.js';

/**
 * Deterministic OCR-text → structured attributes (Phase 3). NO cloud AI, NO
 * embeddings — pure functions over the text an on-device OCR engine produced.
 *
 * Design rules:
 *  - Never treat every number as a price or a pack size.
 *  - Promotional words ("new", "free", "extra") are metadata, not identity.
 *  - A printed price is an OBSERVATION; it never overwrites a selling price.
 *  - Preserve the original text alongside every normalized value.
 */

/** Promotional words that must not dominate product identity. */
const PROMO_TERMS = [
  'new', 'improved', 'extra', 'free', 'save', 'special', 'offer', 'family',
  'value', 'limited', 'edition', 'bonus', 'mega', 'jumbo', 'combo', 'gift',
];

/** Words that mark a nearby number as NOT a price. */
const NON_PRICE_MARKERS = /(mfg|mfd|exp|expiry|batch|b\.?no|lot|net wt|barcode|helpline|uan|date|%)/i;

export interface PrintedPrice {
  amountMinor: number; // integer paisa
  currency: string;
  label: string | null;
  confidence: 'high' | 'medium' | 'low';
  sourceText: string;
  warnings: string[];
}

export interface ManufacturerInfo {
  text: string;
  relation: 'manufactured' | 'marketed' | 'packed' | 'imported' | 'distributed';
}

export interface ExtractedAttributes {
  fullText: string;
  normalizedText: string;
  lines: string[];
  packSize: ParsedPackSize | null;
  printedPrice: PrintedPrice | null;
  promotional: { isPromotional: boolean; terms: string[] };
  manufacturer: ManufacturerInfo | null;
  /** Normalized phrases that could be a brand or product name (promo-filtered). */
  brandNameCandidates: string[];
  warnings: string[];
}

/** Fix OCR digit/letter confusions INSIDE a token believed to be numeric. */
export function fixNumericOcr(token: string): string {
  return token
    .replace(/[Oo]/g, '0')
    .replace(/[lI|]/g, '1')
    .replace(/[Ss]/g, '5')
    .replace(/[B]/g, '8')
    .replace(/k9\b/gi, 'kg')
    .replace(/m1\b/gi, 'ml');
}

function splitLines(text: string): string[] {
  return text.split(/\r?\n/u).map((l) => collapseSpaces(l)).filter(Boolean);
}

/* ------------------------------------------------------------ printed price */

export function extractPrintedPrice(text: string): PrintedPrice | null {
  const lines = splitLines(text);
  const candidates: PrintedPrice[] = [];
  for (const line of lines) {
    if (NON_PRICE_MARKERS.test(line) && !/\b(mrp|rs|pkr|price)\b/i.test(line)) continue;
    // Labelled: "Rs 850", "MRP 850", "Price: 850", "PKR 1,250.00", "850/-", "850 روپے"
    const labelled = line.match(/\b(mrp|max retail price|retail price|price|rs\.?|pkr)\b[:.\s]*([0-9][0-9,]{0,7}(?:\.[0-9]{1,2})?)/i);
    const trailing = line.match(/([0-9][0-9,]{0,7}(?:\.[0-9]{1,2})?)\s*(?:\/-|روپے|\brs\b|\bpkr\b)/i);
    const m = labelled ?? trailing;
    if (!m) continue;
    const label = labelled ? labelled[1]! : null;
    const numStr = (labelled ? labelled[2]! : trailing![1]!).replace(/,/g, '');
    const amount = Number(numStr);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 10_000_000) continue;
    const warnings: string[] = [];
    // Guard: a 4-digit number that looks like a year, with no strong label.
    if (!label && /^(19|20)\d{2}$/.test(numStr)) { warnings.push('looks like a year'); continue; }
    const confidence: PrintedPrice['confidence'] = /mrp|price|retail/i.test(label ?? '')
      ? 'high' : label ? 'medium' : 'low';
    candidates.push({
      amountMinor: Math.round(amount * 100),
      currency: 'PKR',
      label: label ? label.toUpperCase() : null,
      confidence, sourceText: line, warnings,
    });
  }
  if (candidates.length === 0) return null;
  const order = { high: 0, medium: 1, low: 2 } as const;
  candidates.sort((a, b) => order[a.confidence] - order[b.confidence]);
  if (candidates.length > 1) candidates[0]!.warnings.push('multiple prices detected on package');
  return candidates[0]!;
}

/* ------------------------------------------------------------ manufacturer */

export function extractManufacturer(text: string): ManufacturerInfo | null {
  const m = text.match(/\b(manufactured|mfg|marketed|packed|imported|distributed)\s+by[:\s]+([A-Za-z0-9 .,&()-]{2,60})/i);
  if (!m) return null;
  const relWord = m[1]!.toLowerCase();
  const relation: ManufacturerInfo['relation'] =
    relWord.startsWith('manufact') || relWord === 'mfg' ? 'manufactured'
      : relWord === 'marketed' ? 'marketed'
        : relWord === 'packed' ? 'packed'
          : relWord === 'imported' ? 'imported' : 'distributed';
  return { text: collapseSpaces(m[2]!).replace(/[.,]+$/, ''), relation };
}

/* --------------------------------------------------------------- pack size */

/** Try each line (with OCR-confusion repair) and return the most confident size. */
export function extractPackSize(text: string): ParsedPackSize | null {
  const lines = splitLines(text);
  let best: ParsedPackSize | null = null;
  const rank = { high: 0, medium: 1, low: 2 } as const;
  for (const raw of lines) {
    for (const base of [raw, fixNumericOcr(raw)]) {
      // Parse the whole line AND the substring from the first digit, so a size
      // embedded after a label ("Net 500 g") is still found.
      const fromDigit = base.match(/\d.*$/u)?.[0];
      for (const variant of fromDigit && fromDigit !== base ? [base, fromDigit] : [base]) {
        const p = parsePackSize(variant);
        if (p.quantity == null && p.unitsPerPack === 1) continue;
        if (!best || rank[p.confidence] < rank[best.confidence]) best = p;
        if (best.confidence === 'high') return best;
      }
    }
  }
  return best;
}

/* --------------------------------------------------- promo + name candidates */

export function detectPromotional(text: string): { isPromotional: boolean; terms: string[] } {
  const norm = normalizeText(text);
  const found = PROMO_TERMS.filter((t) => new RegExp(`\\b${t}\\b`, 'u').test(norm));
  // Percent offers: check the RAW text (normalizeText strips '%').
  if (/\d+\s*%\s*(extra|free|off)/i.test(text)) found.push('percent_offer');
  return { isPromotional: found.length > 0, terms: [...new Set(found)] };
}

/** Lines that could carry brand/product identity: alphabetic, not pure promo,
 *  not pure size/price. Returned normalized for catalog matching. */
export function extractBrandNameCandidates(text: string): string[] {
  const out: string[] = [];
  for (const line of splitLines(text)) {
    const norm = normalizeText(line);
    if (!norm) continue;
    if (!/[a-z؀-ۿ]/u.test(norm)) continue; // must contain letters
    if (/^\d/.test(norm) && /\b(kg|g|ml|l|rs|pkr|mrp)\b/.test(norm)) continue; // size/price line
    const words = norm.split(' ').filter((w) => !PROMO_TERMS.includes(w));
    if (words.length === 0) continue;
    const phrase = collapseSpaces(words.join(' '));
    if (phrase.length >= 2) out.push(phrase);
  }
  return [...new Set(out)].slice(0, 8);
}

/* ------------------------------------------------------------- top-level */

export function extractAttributes(fullText: string): ExtractedAttributes {
  const text = fullText ?? '';
  return {
    fullText: text,
    normalizedText: normalizeText(text),
    lines: splitLines(text),
    packSize: extractPackSize(text),
    printedPrice: extractPrintedPrice(text),
    promotional: detectPromotional(text),
    manufacturer: extractManufacturer(text),
    brandNameCandidates: extractBrandNameCandidates(text),
    warnings: text.trim() ? [] : ['no text'],
  };
}
