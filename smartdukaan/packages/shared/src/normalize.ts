/**
 * Deterministic text-normalization utilities for the Product Knowledge Base.
 *
 * These are PURE functions — no cloud AI, no network, no randomness. They exist
 * to make matching stable across the messy ways Pakistani retail products are
 * written (mixed English/Urdu, spacing, punctuation, Arabic vs Urdu glyphs).
 *
 * Golden rule: normalization is for MATCHING KEYS ONLY. The original text is
 * always preserved elsewhere; nothing here is ever shown back to the user or
 * used to overwrite a stored display value.
 */

/** Collapse runs of Unicode whitespace to a single ASCII space and trim. */
export function collapseSpaces(input: string): string {
  return input.replace(/\s+/gu, ' ').trim();
}

/**
 * General display/search normalization for a product or alias string:
 * Unicode NFC, lowercase (safe for Latin; Urdu has no case), whitespace
 * collapse, and removal of decorative punctuation — while PRESERVING
 * characters that carry meaning for pack sizes: digits, '.', 'x', '×', '/'.
 */
export function normalizeText(input: string | null | undefined): string {
  if (!input) return '';
  let s = input.normalize('NFC').toLowerCase();
  // Replace common separators/decoration with spaces (keep . x × / for sizes).
  s = s.replace(/[_\-–—,;:!?"'“”‘’()[\]{}|@#*+~`^]/gu, ' ');
  // Drop anything that isn't a letter (any script), digit, space, or . x × /
  s = s.replace(/[^\p{L}\p{N}\s.x×/]/gu, ' ');
  return collapseSpaces(s);
}

/**
 * Urdu-aware normalization: unify Arabic-vs-Urdu code points that render the
 * same to a shopkeeper, strip diacritics (harakat) and tatweel, normalize
 * digits, and collapse spaces. Only SAFE, well-known unifications are applied.
 */
export function normalizeUrdu(input: string | null | undefined): string {
  if (!input) return '';
  let s = input.normalize('NFC');
  const map: Record<string, string> = {
    'ي': 'ی', 'ى': 'ی', // Arabic yeh / alef maksura -> Urdu yeh
    'ك': 'ک', // Arabic kaf -> Urdu kaf
    'ۀ': 'ہ', 'ة': 'ہ', 'ه': 'ہ', // heh variants -> Urdu heh
    'أ': 'ا', 'إ': 'ا', 'آ': 'ا', 'ٱ': 'ا', // alef variants
    'ؤ': 'و', 'ئ': 'ی',
    '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
    '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9', // Arabic-Indic digits
    '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4',
    '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9', // Extended (Urdu) digits
  };
  s = s.replace(/[ً-ْٰـ]/gu, ''); // harakat + superscript alef + tatweel
  s = s.replace(/[يىكۀةهأإآٱؤئ٠-٩۰-۹]/gu, (c) => map[c] ?? c);
  return collapseSpaces(s.toLowerCase());
}

/** Roman-Urdu normalization: lowercase, collapse, and fold a few frequent
 *  spelling variants so "surf excel" ≈ "surf exel". Conservative on purpose. */
export function normalizeRomanUrdu(input: string | null | undefined): string {
  if (!input) return '';
  let s = normalizeText(input);
  s = s
    .replace(/\bexel\b/gu, 'excel')
    .replace(/\bcoke\b/gu, 'coca cola')
    .replace(/\bdood\b/gu, 'doodh');
  return collapseSpaces(s);
}

/**
 * Barcode normalization for storage/matching: strip ALL whitespace and control
 * characters, and KEEP the value as a string so leading zeros survive. Never
 * converts to a number.
 */
export function normalizeBarcode(input: string | null | undefined): string {
  if (!input) return '';
  // eslint-disable-next-line no-control-regex
  return input.replace(/[\s\u0000-\u001f\u007f-\u009f]/gu, '');
}
