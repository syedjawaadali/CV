import type { Product } from '@smartdukaan/shared';

/**
 * Best-effort parser that turns a spoken Urdu/English order into cart lines by
 * matching product names against the shop's own catalogue and picking up a
 * nearby quantity (digits, Eastern-Arabic digits, or common number words).
 *
 * It is intentionally forgiving — a shopkeeper says "do Olpers, aik National
 * salt" and gets two lines. Anything it can't match is simply skipped, so the
 * retailer can still add items by hand.
 */

const NUM_WORDS: Record<string, number> = {
  ایک: 1, دو: 2, تین: 3, چار: 4, پانچ: 5, چھ: 6, چھے: 6, سات: 7, آٹھ: 8, نو: 9, دس: 10,
  گیارہ: 11, بارہ: 12,
  ek: 1, do: 2, teen: 3, char: 4, panch: 5, chay: 6, chhay: 6, saat: 7, aath: 8, nau: 9, das: 10,
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};

const EASTERN_DIGITS: Record<string, string> = {
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4',
  '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
};

function normalize(s: string): string {
  return s.replace(/[۰-۹]/g, (d) => EASTERN_DIGITS[d] ?? d).toLowerCase();
}

export interface ParsedLine {
  product: Product;
  quantity: number;
}

export function parseVoiceOrder(transcript: string, products: Product[]): ParsedLine[] {
  const text = normalize(transcript);
  const lines: ParsedLine[] = [];

  for (const p of products) {
    if (!p.active) continue;
    const candidates = [p.name, p.nameUr]
      .filter((n): n is string => !!n)
      .map((n) => normalize(n));

    let hitIndex = -1;
    for (const name of candidates) {
      const i = text.indexOf(name);
      if (i >= 0) { hitIndex = i; break; }
      const firstWord = name.split(/\s+/)[0];
      if (firstWord && firstWord.length >= 3 && text.includes(firstWord)) {
        hitIndex = text.indexOf(firstWord);
        break;
      }
    }
    if (hitIndex < 0) continue;

    // Look just before the product mention for a quantity.
    const before = text.slice(Math.max(0, hitIndex - 24), hitIndex);
    let quantity = 1;
    const digit = before.match(/(\d+(?:\.\d+)?)\s*\S*\s*$/);
    if (digit?.[1]) {
      quantity = Number(digit[1]);
    } else {
      const words = before.trim().split(/\s+/);
      for (let i = words.length - 1; i >= 0; i--) {
        const w = words[i];
        if (w && NUM_WORDS[w] != null) { quantity = NUM_WORDS[w]!; break; }
      }
    }
    lines.push({ product: p, quantity: quantity > 0 ? quantity : 1 });
  }

  return lines;
}
