import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { api, registerOwner, resetDb } from './helpers.js';
import { closePool } from '../db/pool.js';
import { setBarcodeDbProvider } from '../modules/knowledge/externalBarcode.service.js';
import { setWebSearchProvider, type WebSearchProvider } from '../modules/knowledge/webSearch.service.js';

afterAll(async () => { setBarcodeDbProvider(null); setWebSearchProvider(null); await closePool(); });

// Open Food Facts finds nothing (like the real Pakistani-barcode case).
const offMiss = {
  name: 'off', async lookup() {
    return { found: false, provider: 'off', name: null, brand: null, packSize: null, quantityValue: null, quantityUnit: null, imageUrl: null };
  },
};

// Deterministic web-search mock returning Daraz/Bin Hashim/Naheed-style results
// for the user's real barcode 8961100311002 (Hashmi Ispaghol Sachet).
const webSearchMock: WebSearchProvider = {
  name: 'mock-search',
  async search(q: string) {
    if (q.includes('8961100311002')) {
      return [
        { title: 'Hashmi Ispaghol Sachet 7g - Price in Pakistan | Daraz.pk', snippet: 'Buy Hashmi Ispaghol', url: 'https://www.daraz.pk/products/hashmi-i.html' },
        { title: 'Buy Hashmi Ispaghol Sachet Online - Bin Hashim Pharmacy', snippet: '', url: 'https://binhashim.com/hashmi-ispaghol' },
        { title: 'Hashmi Ispaghol Sachet - Naheed.pk', snippet: '', url: 'https://naheed.pk/hashmi-ispaghol' },
      ];
    }
    return [];
  },
};

describe('Web-search barcode resolver (Daraz/BinHashim-style, via approved Search API)', () => {
  beforeEach(async () => { await resetDb(); setBarcodeDbProvider(offMiss); setWebSearchProvider(webSearchMock); });

  it('identifies a Pakistani barcode from web results when the open DB has nothing', async () => {
    const owner = await registerOwner();
    const res = await api(owner.token).post('/api/kb/recognize').send({ barcode: '8961100311002' });
    expect(res.status).toBe(201);
    expect(res.body.candidates.length).toBe(0);
    expect(res.body.externalMatch).not.toBeNull();
    expect(res.body.externalMatch.name.toLowerCase()).toContain('hashmi ispaghol');
    expect(res.body.externalMatch.brand).toBe('Hashmi');
    expect(res.body.externalMatch.provider).toBe('websearch');
  });

  it('the web-search result is cached — a repeat scan does not re-query', async () => {
    const owner = await registerOwner();
    let calls = 0;
    setWebSearchProvider({ name: 'counting', async search() { calls++; return [
      { title: 'Some Product 500g - Daraz.pk', url: 'https://daraz.pk/x' },
      { title: 'Some Product - Bin Hashim', url: 'https://binhashim.com/x' },
    ]; } });
    await api(owner.token).post('/api/kb/recognize').send({ barcode: '6291041500213' });
    await api(owner.token).post('/api/kb/recognize').send({ barcode: '6291041500213' });
    expect(calls).toBe(1); // second scan served from cache
  });

  it('when web search is not configured, it is skipped (honest not-found)', async () => {
    setWebSearchProvider(null); // no provider configured
    const owner = await registerOwner();
    const res = await api(owner.token).post('/api/kb/recognize').send({ barcode: '8961100311002' });
    expect(res.body.externalMatch).toBeNull();
  });
});
