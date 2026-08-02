/**
 * Public barcode-database lookup (provider-independent, backend-only). When a
 * scanned barcode is not found in the retailer's products or the shared catalog,
 * we enrich it from an OPEN public database (Open Food Facts by default — free,
 * no API key) so the create-product form can be prefilled with a name/brand/
 * pack-size suggestion.
 *
 * Guarantees:
 *  - Results are UNVERIFIED suggestions — they only prefill; a human confirms.
 *  - No product is auto-created and no verified global catalog entry is written.
 *  - Results are cached (positives + negatives) to avoid repeated external calls.
 *  - Coverage of local Pakistani products is limited; a "not found" is normal.
 */
import { normalizeBarcode } from '@smartdukaan/shared';
import { query } from '../../db/pool.js';
import { logger } from '../../lib/logger.js';
import { resolveBarcodeViaWebSearch, webSearchConfigured } from './webSearch.service.js';

export interface ExternalProduct {
  found: boolean;
  provider: string;
  name: string | null;
  brand: string | null;
  packSize: string | null;
  quantityValue: number | null;
  quantityUnit: string | null;
  imageUrl: string | null;
}

export interface BarcodeDbProvider {
  readonly name: string;
  lookup(barcodeNormalized: string): Promise<ExternalProduct>;
}

const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const NEG_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // negatives expire sooner
// A miss recorded while web search was NOT configured is incomplete (we never
// consulted web search), so it must expire quickly — otherwise, once web search
// is enabled, the stale negative would keep masking a now-resolvable product.
const INCOMPLETE_NEG_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const TIMEOUT_MS = 6000;

/** Open Food Facts adapter — free, open, no key. Best for grocery/branded items. */
export class OpenFoodFactsProvider implements BarcodeDbProvider {
  readonly name = 'openfoodfacts';
  async lookup(barcode: string): Promise<ExternalProduct> {
    const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json`
      + `?fields=product_name,brands,quantity,image_url,product_quantity,product_quantity_unit`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'SmartDukaan/1.0 (retail app)' } });
      if (!res.ok) return notFound(this.name);
      const json = (await res.json()) as OffResponse;
      if (json.status !== 1 || !json.product) return notFound(this.name);
      const p = json.product;
      const name = clean(p.product_name);
      const brand = clean((p.brands ?? '').split(',')[0]);
      const qv = p.product_quantity != null ? Number(p.product_quantity) : null;
      return {
        found: !!name || !!brand,
        provider: this.name,
        name, brand,
        packSize: clean(p.quantity),
        quantityValue: Number.isFinite(qv as number) ? (qv as number) : null,
        quantityUnit: clean(p.product_quantity_unit),
        imageUrl: clean(p.image_url),
      };
    } catch (err) {
      logger.warn('external barcode lookup failed', { provider: this.name, error: (err as Error).message });
      return notFound(this.name);
    } finally {
      clearTimeout(timer);
    }
  }
}

let providerOverride: BarcodeDbProvider | null = null;
/** Test hook — inject a deterministic provider (no real network in tests). */
export function setBarcodeDbProvider(p: BarcodeDbProvider | null): void { providerOverride = p; }
function getProvider(): BarcodeDbProvider { return providerOverride ?? new OpenFoodFactsProvider(); }

/**
 * Cache-backed public lookup. Returns a cached result when fresh; otherwise
 * calls the provider and caches the outcome (positive or negative).
 */
export async function lookupExternalBarcode(rawBarcode: string): Promise<ExternalProduct | null> {
  const barcode = normalizeBarcode(rawBarcode);
  if (!barcode) return null;
  const provider = getProvider();

  const cached = await query<{
    found: boolean; product_name: string | null; brand: string | null; pack_size: string | null;
    quantity_value: string | null; quantity_unit: string | null; image_url: string | null;
    expires_at: string | null;
  }>(
    `SELECT found, product_name, brand, pack_size, quantity_value, quantity_unit, image_url, expires_at
       FROM external_barcode_cache WHERE barcode_normalized=$1 AND provider=$2`,
    [barcode, provider.name],
  );
  const hit = cached.rows[0];
  if (hit && (!hit.expires_at || new Date(hit.expires_at) > new Date())) {
    return {
      found: hit.found, provider: provider.name, name: hit.product_name, brand: hit.brand,
      packSize: hit.pack_size, quantityValue: hit.quantity_value != null ? Number(hit.quantity_value) : null,
      quantityUnit: hit.quantity_unit, imageUrl: hit.image_url,
    };
  }

  let result = await provider.lookup(barcode);

  // Fallback: if the open DB has nothing, try the web-search resolver (Daraz /
  // Bin Hashim / etc. via an approved Search API) — only when it's configured.
  const webSearchAvailable = webSearchConfigured();
  if (!result.found && webSearchAvailable) {
    try {
      const web = await resolveBarcodeViaWebSearch(barcode);
      if (web?.found && web.name) {
        result = {
          found: true, provider: 'websearch', name: web.name, brand: web.brand,
          packSize: web.packSize, quantityValue: null, quantityUnit: null, imageUrl: null,
        };
      }
    } catch { /* web search is best-effort */ }
  }

  // A negative found without consulting web search is incomplete → short TTL so
  // it cannot durably mask a product that becomes resolvable once web search is
  // enabled. A positive, or a negative after a full lookup, gets the long TTL.
  const ttl = result.found
    ? CACHE_TTL_MS
    : webSearchAvailable ? NEG_CACHE_TTL_MS : INCOMPLETE_NEG_CACHE_TTL_MS;
  const expires = new Date(Date.now() + ttl).toISOString();
  await query(
    `INSERT INTO external_barcode_cache
       (barcode_normalized, provider, found, product_name, brand, pack_size, quantity_value, quantity_unit, image_url, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (barcode_normalized, provider)
     DO UPDATE SET found=EXCLUDED.found, product_name=EXCLUDED.product_name, brand=EXCLUDED.brand,
                   pack_size=EXCLUDED.pack_size, quantity_value=EXCLUDED.quantity_value,
                   quantity_unit=EXCLUDED.quantity_unit, image_url=EXCLUDED.image_url,
                   fetched_at=now(), expires_at=EXCLUDED.expires_at`,
    [barcode, provider.name, result.found, result.name, result.brand, result.packSize,
      result.quantityValue, result.quantityUnit, result.imageUrl, expires],
  ).catch(() => { /* cache write is best-effort */ });

  return result;
}

function notFound(provider: string): ExternalProduct {
  return { found: false, provider, name: null, brand: null, packSize: null, quantityValue: null, quantityUnit: null, imageUrl: null };
}
function clean(s: string | null | undefined): string | null {
  if (!s) return null;
  const t = String(s).trim();
  return t ? t.slice(0, 200) : null;
}

interface OffResponse { status?: number; product?: {
  product_name?: string; brands?: string; quantity?: string; image_url?: string;
  product_quantity?: string | number; product_quantity_unit?: string;
} }
