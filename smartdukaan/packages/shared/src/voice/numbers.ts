/**
 * Spoken-number & currency parsing (Phase 5) — pure, deterministic.
 *
 * Handles English words, Urdu-script digits (۰–۹), Urdu/Roman-Urdu number words
 * (aik/das/sau/hazar, panch sau, دو ہزار), and the common Pakistani fractional
 * quantities dedh (1.5), sawa (1.25), pauna (0.75), adha (0.5), plus "sawa do"
 * (2.25) / "dedh" style compounds. Ambiguous input yields low confidence so the
 * caller asks for confirmation rather than guessing.
 */

const EASTERN_ARABIC = '۰۱۲۳۴۵۶۷۸۹';
const PERSIAN = '٠١٢٣٤٥٦٧٨٩';

/** Fold Urdu/Persian digits to ASCII so the rest can work on 0–9. */
export function foldDigits(input: string): string {
  let out = '';
  for (const ch of input) {
    const e = EASTERN_ARABIC.indexOf(ch);
    const p = PERSIAN.indexOf(ch);
    if (e >= 0) out += String(e);
    else if (p >= 0) out += String(p);
    else out += ch;
  }
  return out;
}

// Base word values (English + Roman Urdu + Urdu script).
const UNITS: Record<string, number> = {
  zero: 0, sifar: 0, صفر: 0,
  one: 1, aik: 1, ek: 1, ایک: 1,
  two: 2, do: 2, دو: 2,
  three: 3, teen: 3, تین: 3,
  four: 4, char: 4, chaar: 4, چار: 4,
  five: 5, panch: 5, paanch: 5, پانچ: 5,
  six: 6, chay: 6, che: 6, chhe: 6, چھ: 6,
  seven: 7, saat: 7, سات: 7,
  eight: 8, aath: 8, آٹھ: 8,
  nine: 9, nau: 9, نو: 9,
  ten: 10, das: 10, dus: 10, دس: 10,
  eleven: 11, gyara: 11, gyarah: 11, گیارہ: 11,
  twelve: 12, bara: 12, barah: 12, بارہ: 12,
  fifteen: 15, pandra: 15, pandrah: 15, پندرہ: 15,
  twenty: 20, bees: 20, بیس: 20,
  fifty: 50, pachas: 50, pachaas: 50, پچاس: 50,
};

const MULTIPLIERS: Record<string, number> = {
  hundred: 100, sau: 100, سو: 100,
  thousand: 1000, hazar: 1000, hazaar: 1000, ہزار: 1000,
  lakh: 100000, lac: 100000, لاکھ: 100000,
};

// Fractional quantity words common in Pakistani retail.
const FRACTIONS: Record<string, number> = {
  adha: 0.5, aadha: 0.5, آدھا: 0.5, half: 0.5,
  dedh: 1.5, derh: 1.5, ڈیڑھ: 1.5,
  dhai: 2.5, ڈھائی: 2.5,
};
// Multiplicative fraction prefixes: "sawa X" = X+0.25, "pauna X" = X-0.25, "sadhe X" = X+0.5
const FRACTION_PREFIX: Record<string, number> = {
  sawa: 0.25, سوا: 0.25,
  pauna: -0.25, poune: -0.25, پونے: -0.25, paune: -0.25,
  sadhe: 0.5, saadhe: 0.5, ساڑھے: 0.5,
};

/** True if a single token is a number/multiplier/fraction word in any supported language. */
export function isNumberWord(token: string): boolean {
  const t = foldDigits(token).toLowerCase();
  if (/^\d+(\.\d+)?$/.test(t)) return true;
  return UNITS[t] !== undefined || MULTIPLIERS[t] !== undefined
    || FRACTIONS[t] !== undefined || FRACTION_PREFIX[t] !== undefined;
}

export interface ParsedNumber {
  value: number | null;
  confidence: number; // 0..1
  matchedText: string;
  ambiguous: boolean;
}

const WORD_SPLIT = /[\s,]+/;

/**
 * Parse the FIRST clear numeric expression in a (normalized) transcript.
 * Returns null value when nothing parseable is found.
 */
export function parseSpokenNumber(input: string): ParsedNumber {
  const folded = foldDigits(input).toLowerCase();

  // 1) A plain digit run wins (already-numeric or folded Urdu digits).
  const digit = folded.match(/\d+(?:\.\d+)?/);
  const words = folded.split(WORD_SPLIT).filter(Boolean);

  // 2) Fractional-prefix compounds: "sawa do", "pauna char", "sadhe teen".
  for (let i = 0; i < words.length - 1; i++) {
    const pf = FRACTION_PREFIX[words[i]!];
    if (pf !== undefined) {
      const base = UNITS[words[i + 1]!];
      if (base !== undefined) {
        return { value: round2(base + pf * signOfBase(base)), confidence: 0.9, matchedText: `${words[i]} ${words[i + 1]}`, ambiguous: false };
      }
    }
  }
  // 3) Standalone fraction words: dedh, adha, dhai.
  for (const w of words) {
    if (FRACTIONS[w] !== undefined) {
      return { value: FRACTIONS[w]!, confidence: 0.85, matchedText: w, ambiguous: false };
    }
  }

  // 4) Word-based cardinal composition (e.g. "panch sau", "do hazar", "ek sau bees").
  const composed = composeWords(words);
  if (composed != null) {
    // If a bare digit ALSO appears and disagrees, mark ambiguous.
    if (digit && Number(digit[0]) !== composed) {
      return { value: composed, confidence: 0.5, matchedText: words.join(' '), ambiguous: true };
    }
    return { value: composed, confidence: 0.85, matchedText: words.join(' '), ambiguous: false };
  }

  // 5) Fall back to a bare digit run.
  if (digit) return { value: Number(digit[0]), confidence: 0.9, matchedText: digit[0], ambiguous: false };

  return { value: null, confidence: 0, matchedText: '', ambiguous: false };
}

function signOfBase(_base: number): number { return 1; }

function composeWords(words: string[]): number | null {
  let total = 0;
  let current = 0;
  let sawAny = false;
  for (const w of words) {
    if (UNITS[w] !== undefined) { current += UNITS[w]!; sawAny = true; continue; }
    if (MULTIPLIERS[w] !== undefined) {
      const m = MULTIPLIERS[w]!;
      current = (current === 0 ? 1 : current) * m;
      if (m >= 1000) { total += current; current = 0; }
      sawAny = true;
      continue;
    }
    // Non-number word ends the run once we've started accumulating.
    if (sawAny) break;
  }
  if (!sawAny) return null;
  return total + current;
}

function round2(n: number): number { return Math.round(n * 100) / 100; }

export interface ParsedMoney { amountMajor: number | null; currency: string; confidence: number; ambiguous: boolean }

const CURRENCY_HINT = /(rs|rupay|rupees|rupee|pkr|روپے|روپیہ|روپیے)/i;

/** Parse a spoken money amount in MAJOR units (rupees). Never returns floats of paisa. */
export function parseSpokenMoney(input: string): ParsedMoney {
  const hasCurrency = CURRENCY_HINT.test(foldDigits(input));
  const n = parseSpokenNumber(input);
  if (n.value == null) return { amountMajor: null, currency: 'PKR', confidence: 0, ambiguous: false };
  // A currency hint raises confidence; a bare number without one is slightly lower.
  const confidence = hasCurrency ? Math.min(1, n.confidence + 0.05) : n.confidence * 0.9;
  return { amountMajor: n.value, currency: 'PKR', confidence, ambiguous: n.ambiguous };
}
