/**
 * Web-search → product extractor (pure, deterministic). Given a barcode and a
 * list of search-engine results (title + snippet + url) that mention it, derive
 * a probable product name / brand / pack size by cleaning marketplace title
 * noise and voting across sources. This is how the app legitimately reproduces
 * "look the barcode up online" — a search API returns Daraz / Bin Hashim / etc.
 * results, and this turns their messy titles into a clean SUGGESTION.
 *
 * The output is ALWAYS an unverified suggestion for human confirmation. Higher
 * confidence requires the same product name appearing across multiple distinct
 * sources (anti-noise / anti-single-listing).
 */
import { collapseSpaces } from '../normalize.js';

export interface SearchResult { title: string; snippet?: string | null; url?: string | null }

export interface WebProduct {
  found: boolean;
  name: string | null;
  brand: string | null;
  packSize: string | null;
  confidence: 'low' | 'medium' | 'high';
  sourceDomains: string[];
  votes: number;
}

// Marketplace / SEO noise removed from titles before comparing.
const NOISE = [
  'price in pakistan', 'best price', 'lowest price', 'buy online', 'buy now', 'online', 'buy',
  'price', 'prices', 'in pakistan', 'pakistan', 'daraz', 'daraz.pk', 'bin hashim', 'binhashim',
  'naheed', 'alfatah', 'metro', 'shop', 'store', 'sale', 'review', 'reviews', 'specifications',
  'specification', 'features', 'with best', 'at best', 'order online', 'free delivery', ', karachi',
  'lahore', 'islamabad', 'rawalpindi', 'karachi', 'com.pk', '.pk', '.com',
];
const SPLIT = /\s*[|›»—–\-:•]\s*|\s{2,}/;
const PRICE = /\b(rs\.?|pkr|₨)\s*[\d,]+(\.\d+)?\b/gi;

function domainOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const h = new URL(url.startsWith('http') ? url : `https://${url}`).hostname;
    return h.replace(/^www\./, '');
  } catch { return null; }
}

function cleanTitle(title: string, barcode: string): string {
  let t = ` ${title.toLowerCase()} `;
  t = t.replace(new RegExp(barcode, 'g'), ' ');       // drop the barcode digits
  t = t.replace(PRICE, ' ');                          // drop prices
  // Prefer the first title segment (usually the product), then strip noise.
  const first = title.split(SPLIT)[0] ?? title;
  let seg = ` ${first.toLowerCase()} `;
  seg = seg.replace(new RegExp(barcode, 'g'), ' ').replace(PRICE, ' ');
  for (const n of NOISE) seg = seg.replace(new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g'), ' ');
  seg = collapseSpaces(seg.replace(/[^a-z0-9؀-ۿ .]/gi, ' '));
  return seg.trim();
}

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\s+/g, ' ').trim();
}

const UNIT = /^(g|kg|gm|gms|ml|l|ltr|litre|liter|pcs|pack|packet)$/i;
/** Detect a trailing pack-size at the end of the word list, e.g. ["...","7g"] or ["...","500","ml"]. */
function trailingPack(words: string[]): { text: string; wordCount: number } | null {
  if (words.length === 0) return null;
  const last = words[words.length - 1]!;
  const m = last.match(/^(\d+(?:\.\d+)?)(g|kg|gm|ml|l|ltr|pcs)$/i);
  if (m) return { text: `${m[1]}${m[2]!.toLowerCase()}`, wordCount: 1 };
  const prev = words[words.length - 2];
  if (prev && /^\d+(\.\d+)?$/.test(prev) && UNIT.test(last)) {
    return { text: `${prev} ${last.toLowerCase()}`, wordCount: 2 };
  }
  return null;
}

/** Extract a product suggestion from search results mentioning the barcode. */
export function extractProductFromSearch(barcode: string, results: SearchResult[]): WebProduct {
  const empty: WebProduct = { found: false, name: null, brand: null, packSize: null, confidence: 'low', sourceDomains: [], votes: 0 };
  if (!results || results.length === 0) return empty;

  // Vote on cleaned candidate names (pack size stripped for voting, kept aside),
  // tracking which domains support each so different-size listings still agree.
  const votes = new Map<string, Set<string>>();
  const packSizes = new Map<string, number>();
  results.forEach((r, i) => {
    const cleaned = cleanTitle(r.title ?? '', barcode);
    if (cleaned.length < 3 || !/[a-z؀-ۿ]/i.test(cleaned)) return;
    let words = cleaned.split(' ').filter(Boolean).slice(0, 8);
    // Strip a trailing pack-size token (e.g. "7g", "1kg", "500 ml") from the vote key.
    const packStr = trailingPack(words);
    if (packStr) { words = words.slice(0, words.length - packStr.wordCount); packSizes.set(packStr.text, (packSizes.get(packStr.text) ?? 0) + 1); }
    const key = words.join(' ');
    if (words.length < 1 || key.length < 3) return;
    const dom = domainOf(r.url) ?? `src${i}`;
    const set = votes.get(key) ?? new Set<string>();
    set.add(dom);
    votes.set(key, set);
  });
  if (votes.size === 0) return empty;

  // Winner = most distinct supporting domains, then longest (more specific) name.
  const ranked = [...votes.entries()]
    .map(([name, doms]) => ({ name, domains: [...doms], count: doms.size }))
    .sort((a, b) => b.count - a.count || b.name.length - a.name.length);
  const win = ranked[0]!;

  const name = titleCase(win.name);
  const brand = titleCase(win.name.split(' ')[0] ?? '') || null;
  // Most-cited pack size across the results.
  const packSize = [...packSizes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  // Confidence rises with cross-source agreement.
  const confidence: WebProduct['confidence'] = win.count >= 3 ? 'high' : win.count === 2 ? 'medium' : 'low';

  return {
    found: true,
    name,
    brand: brand && brand !== name ? brand : brand,
    packSize,
    confidence,
    sourceDomains: win.domains.filter((d) => !d.startsWith('src')),
    votes: win.count,
  };
}
