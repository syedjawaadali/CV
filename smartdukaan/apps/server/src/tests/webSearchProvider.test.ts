import { describe, it, expect, vi, afterEach } from 'vitest';
import { SerperProvider, GoogleSearchProvider } from '../modules/knowledge/webSearch.service.js';

/**
 * Adapter-shape tests: verify each provider maps its API's raw JSON into the
 * shared SearchResult[] shape correctly. `fetch` is stubbed — no real network,
 * no real key. This is the one thing the injected-mock integration tests can't
 * cover (they replace the provider entirely).
 */

afterEach(() => { vi.unstubAllGlobals(); });

function stubFetch(payload: unknown, ok = true) {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok, json: async () => payload }) as unknown as Response));
}

describe('SerperProvider', () => {
  it('maps organic[] to SearchResult[] (title/snippet/url)', async () => {
    stubFetch({
      organic: [
        { title: 'Hashmi Ispaghol Sachet 7g - Daraz.pk', snippet: 'Buy online', link: 'https://daraz.pk/x' },
        { title: 'Hashmi Ispaghol - Bin Hashim', link: 'https://binhashim.com/y' },
      ],
    });
    const p = new SerperProvider('fake-key');
    const results = await p.search('8961100311002 product');
    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({ title: 'Hashmi Ispaghol Sachet 7g - Daraz.pk', snippet: 'Buy online', url: 'https://daraz.pk/x' });
    expect(results[1]!.snippet).toBeNull(); // missing snippet becomes null, not undefined
    expect(results[1]!.url).toBe('https://binhashim.com/y');
  });

  it('returns [] when the API responds non-200', async () => {
    stubFetch({ message: 'unauthorized' }, false);
    const results = await new SerperProvider('bad-key').search('x');
    expect(results).toEqual([]);
  });

  it('returns [] (never throws) on a missing organic field', async () => {
    stubFetch({});
    expect(await new SerperProvider('k').search('x')).toEqual([]);
  });
});

describe('GoogleSearchProvider', () => {
  it('maps items[] to SearchResult[]', async () => {
    stubFetch({ items: [{ title: 'T', snippet: 'S', link: 'https://e/1' }] });
    const results = await new GoogleSearchProvider('k', 'cx').search('q');
    expect(results).toEqual([{ title: 'T', snippet: 'S', url: 'https://e/1' }]);
  });
});
