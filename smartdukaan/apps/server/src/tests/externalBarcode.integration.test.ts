import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { api, registerOwner, resetDb, type Session } from './helpers.js';
import { pool, closePool } from '../db/pool.js';
import { setBarcodeDbProvider, type BarcodeDbProvider } from '../modules/knowledge/externalBarcode.service.js';
import { setWebSearchProvider } from '../modules/knowledge/webSearch.service.js';

afterAll(async () => { setBarcodeDbProvider(null); setWebSearchProvider(null); await closePool(); });

// Deterministic mock public-DB provider — no real network in tests.
const mockProvider: BarcodeDbProvider = {
  name: 'mock-openfoodfacts',
  async lookup(barcode: string) {
    if (barcode === '3017620422003') {
      return { found: true, provider: 'mock-openfoodfacts', name: 'Nutella', brand: 'Ferrero', packSize: '750 g', quantityValue: 750, quantityUnit: 'g', imageUrl: 'https://images.openfoodfacts.org/x.jpg' };
    }
    return { found: false, provider: 'mock-openfoodfacts', name: null, brand: null, packSize: null, quantityValue: null, quantityUnit: null, imageUrl: null };
  },
};

async function createProduct(s: Session, body: Record<string, unknown>) {
  const res = await api(s.token).post('/api/products').send({ sellingPrice: 100, unit: 'packet', ...body });
  if (res.status !== 201) throw new Error(`createProduct ${res.status}`);
  return res.body as { id: string };
}

describe('Public barcode database enrichment', () => {
  beforeEach(async () => { await resetDb(); setBarcodeDbProvider(mockProvider); });

  it('an unknown barcode is enriched from the public DB as an UNVERIFIED suggestion (prefill only)', async () => {
    const owner = await registerOwner();
    const res = await api(owner.token).post('/api/kb/recognize').send({ barcode: '3017620422003' });
    expect(res.status).toBe(201);
    expect(res.body.candidates.length).toBe(0);       // not in this shop or the shared catalog
    expect(res.body.externalMatch).not.toBeNull();
    expect(res.body.externalMatch.name).toBe('Nutella');
    expect(res.body.externalMatch.brand).toBe('Ferrero');

    // It only PREFILLS — no product was auto-created.
    const products = await pool.query(`SELECT count(*)::int n FROM products WHERE shop_id=$1`, [owner.user.shopId as string]);
    expect(products.rows[0].n).toBe(0);
  });

  it('a barcode not in the public DB returns no external match (honest not-found)', async () => {
    const owner = await registerOwner();
    // 8964000000017 is a Pakistani barcode our mock does not know.
    const res = await api(owner.token).post('/api/kb/recognize').send({ barcode: '8964000000017' });
    expect(res.body.externalMatch).toBeNull();
  });

  it('a local product match takes precedence and skips the external lookup', async () => {
    const owner = await registerOwner();
    await createProduct(owner, { name: 'My Nutella', barcode: '3017620422003' });
    const res = await api(owner.token).post('/api/kb/recognize').send({ barcode: '3017620422003' });
    expect(res.body.candidates[0].retailerProductId).toBeTruthy(); // local wins
    expect(res.body.confidence).toBe('exact');
    expect(res.body.externalMatch).toBeNull(); // no external call when a local match exists
  });

  it('the public result is cached (second scan does not need a second provider call)', async () => {
    const owner = await registerOwner();
    let calls = 0;
    setBarcodeDbProvider({
      name: 'counting', async lookup() { calls++; return { found: true, provider: 'counting', name: 'Cached Item', brand: null, packSize: null, quantityValue: null, quantityUnit: null, imageUrl: null }; },
    });
    await api(owner.token).post('/api/kb/recognize').send({ barcode: '5901234123457' });
    await api(owner.token).post('/api/kb/recognize').send({ barcode: '5901234123457' });
    expect(calls).toBe(1); // second scan served from cache
    const cache = await pool.query(`SELECT count(*)::int n FROM external_barcode_cache WHERE barcode_normalized='5901234123457'`);
    expect(cache.rows[0].n).toBe(1);
  });

  it('a miss while web search is UNCONFIGURED is cached only briefly (so it cannot durably mask a later resolvable product)', async () => {
    setWebSearchProvider(null); // web search not configured at lookup time
    const owner = await registerOwner();
    await api(owner.token).post('/api/kb/recognize').send({ barcode: '8964000000017' });
    const row = await pool.query<{ found: boolean; ttl_hours: number }>(
      `SELECT found, EXTRACT(EPOCH FROM (expires_at - now()))/3600 AS ttl_hours
         FROM external_barcode_cache WHERE barcode_normalized='8964000000017'`,
    );
    const cached = row.rows[0]!;
    expect(cached.found).toBe(false);
    // Incomplete negative → ~1h TTL, well under the 7-day full-negative TTL.
    expect(Number(cached.ttl_hours)).toBeLessThan(2);
  });
});
