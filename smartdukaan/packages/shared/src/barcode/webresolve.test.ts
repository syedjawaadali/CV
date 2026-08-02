import { describe, it, expect } from 'vitest';
import { extractProductFromSearch, type SearchResult } from './webresolve.js';

// Realistic marketplace titles a Search API would return for 8961100311002.
const HASHMI: SearchResult[] = [
  { title: 'Hashmi Ispaghol Sachet 7g - Price in Pakistan | Daraz.pk', url: 'https://www.daraz.pk/products/hashmi-ispaghol-i123.html' },
  { title: 'Buy Hashmi Ispaghol Sachet Online - Bin Hashim Pharmacy', url: 'https://www.binhashim.com/hashmi-ispaghol' },
  { title: 'Hashmi Ispaghol Sachet - Naheed.pk', url: 'https://www.naheed.pk/hashmi-ispaghol-sachet' },
];

describe('extractProductFromSearch', () => {
  it('extracts a clean product name from noisy marketplace titles', () => {
    const r = extractProductFromSearch('8961100311002', HASHMI);
    expect(r.found).toBe(true);
    expect(r.name!.toLowerCase()).toContain('hashmi ispaghol');
    expect(r.brand).toBe('Hashmi');
  });

  it('cross-source agreement raises confidence (3 distinct domains => high)', () => {
    const r = extractProductFromSearch('8961100311002', HASHMI);
    expect(r.votes).toBe(3);
    expect(r.confidence).toBe('high');
    expect(r.sourceDomains).toEqual(expect.arrayContaining(['daraz.pk', 'binhashim.com', 'naheed.pk']));
  });

  it('a single listing is only low confidence (anti-noise)', () => {
    const r = extractProductFromSearch('8961100311002', [HASHMI[0]!]);
    expect(r.confidence).toBe('low');
    expect(r.votes).toBe(1);
  });

  it('strips prices, barcode digits and site suffixes', () => {
    const r = extractProductFromSearch('8961100311002', [
      { title: 'Surf Excel Washing Powder 1kg - Rs 850 - Price in Pakistan - Daraz.pk', url: 'https://daraz.pk/x' },
      { title: 'Surf Excel Washing Powder 1kg | Bin Hashim', url: 'https://binhashim.com/x' },
    ]);
    expect(r.name!.toLowerCase()).toContain('surf excel');
    expect(r.name!).not.toMatch(/850|rs|daraz|price/i);
  });

  it('returns not-found for empty results', () => {
    expect(extractProductFromSearch('8961100311002', []).found).toBe(false);
  });
});
