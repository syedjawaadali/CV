/**
 * Web-search barcode discovery (provider-independent, backend-only). This is the
 * legitimate way to "look a barcode up online" the way ChatGPT did: a Search API
 * returns results from Daraz / Bin Hashim / Naheed / etc., and the pure extractor
 * (@smartdukaan/shared) turns their messy titles into a product suggestion.
 *
 * IMPORTANT — no site is scraped directly. We query an approved Search API whose
 * terms permit programmatic use; those sites appear in the results. Without a
 * configured provider + key this whole path is skipped (falls back to Open Food
 * Facts + manual entry). Results are UNVERIFIED suggestions requiring human
 * confirmation, and are cached to avoid repeat calls / cost.
 */
import { extractProductFromSearch, type SearchResult, type WebProduct } from '@smartdukaan/shared';
import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';

export interface WebSearchProvider {
  readonly name: string;
  /** Return raw search results for a query, or [] on failure. */
  search(query: string): Promise<SearchResult[]>;
}

const TIMEOUT_MS = 6000;

/** Brave Search API adapter (clean API, ToS-friendly, generous free tier). */
export class BraveSearchProvider implements WebSearchProvider {
  readonly name = 'brave';
  constructor(private apiKey: string) {}
  async search(query: string): Promise<SearchResult[]> {
    const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=8&country=pk`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json', 'X-Subscription-Token': this.apiKey } });
      if (!res.ok) return [];
      const json = (await res.json()) as { web?: { results?: Array<{ title?: string; description?: string; url?: string }> } };
      return (json.web?.results ?? []).map((r) => ({ title: r.title ?? '', snippet: r.description ?? null, url: r.url ?? null }));
    } catch (err) {
      logger.warn('web search failed', { provider: this.name, error: (err as Error).message });
      return [];
    } finally { clearTimeout(timer); }
  }
}

/** SerpApi adapter (Google results via a licensed API). */
export class SerpApiProvider implements WebSearchProvider {
  readonly name = 'serpapi';
  constructor(private apiKey: string) {}
  async search(query: string): Promise<SearchResult[]> {
    const url = `https://serpapi.com/search.json?engine=google&gl=pk&num=8&q=${encodeURIComponent(query)}&api_key=${encodeURIComponent(this.apiKey)}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      if (!res.ok) return [];
      const json = (await res.json()) as { organic_results?: Array<{ title?: string; snippet?: string; link?: string }> };
      return (json.organic_results ?? []).map((r) => ({ title: r.title ?? '', snippet: r.snippet ?? null, url: r.link ?? null }));
    } catch (err) {
      logger.warn('web search failed', { provider: this.name, error: (err as Error).message });
      return [];
    } finally { clearTimeout(timer); }
  }
}

let override: WebSearchProvider | null = null;
/** Test hook — inject a deterministic search provider (no real network in tests). */
export function setWebSearchProvider(p: WebSearchProvider | null): void { override = p; }

export function getWebSearchProvider(): WebSearchProvider | null {
  if (override) return override;
  if (env.webSearch.provider === 'brave' && env.webSearch.apiKey) return new BraveSearchProvider(env.webSearch.apiKey);
  if (env.webSearch.provider === 'serpapi' && env.webSearch.apiKey) return new SerpApiProvider(env.webSearch.apiKey);
  return null; // not configured → path is skipped
}

export function webSearchConfigured(): boolean { return getWebSearchProvider() !== null; }

/** Resolve a barcode to a product suggestion via web search (or null if unavailable/none). */
export async function resolveBarcodeViaWebSearch(barcodeNormalized: string): Promise<WebProduct | null> {
  const provider = getWebSearchProvider();
  if (!provider) return null;
  // Query the exact barcode plus a product hint to bias toward listing pages.
  const results = await provider.search(`${barcodeNormalized} product`);
  if (results.length === 0) return null;
  const extracted = extractProductFromSearch(barcodeNormalized, results);
  return extracted.found ? extracted : null;
}
