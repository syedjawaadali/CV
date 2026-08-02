# Barcode Resolver — how Smart Dukaan identifies a scanned product

When a barcode is scanned, the backend resolves it through an ordered chain of
sources. Every online result is an **unverified suggestion** that pre-fills the
create-product form; a human always confirms, and confirmations feed the shared
Pakistani catalog. No site is scraped directly.

## Resolution order
1. **This shop's products** — exact match wins immediately.
2. **Shared crowd-built catalog** — products other retailers confirmed (review-gated).
3. **Open Food Facts** — free, open, no key. Good for imported/branded grocery. (LIVE)
4. **Web-search resolver** — an approved Search API (Serper / Google / SerpApi /
   Brave) returns results from Daraz, Bin Hashim, Naheed, Medlife, Empress Market,
   etc.; the pure extractor (`shared/barcode/webresolve.ts`) votes across sources
   to derive a clean name / brand / pack size. **Key-gated: skipped unless
   configured.** Verified live: `8961100311002` → "Hashmi Ispaghol Sachet"
   (brand Hashmi, high confidence, 4 agreeing retailer domains).
5. **Manual entry** — always available.

## Why not scrape Daraz / Bin Hashim directly?
- Their Terms of Service prohibit automated scraping; Daraz actively blocks bots.
- Product data is JavaScript-rendered behind anti-bot — static HTML has nothing
  (verified). A production server would be IP-banned quickly.
- It creates legal exposure. The Search-API path returns the **same listings**
  legitimately, because those sites are indexed by the search engine.

## Configuration (backend-only; no secret ever ships in the app)
```
WEB_SEARCH_PROVIDER=serper       # or google, serpapi, brave, or none (default)
WEB_SEARCH_API_KEY=<key>         # backend env only
WEB_SEARCH_CX=<engine-id>        # ONLY for provider=google (Programmable Search)
FEATURE_EXTERNAL_BARCODE_LOOKUP=1
```
Without a key the app runs on Open Food Facts + manual entry — nothing breaks.

- **Serper.dev** — real Google results via a simple API; free tier open to new
  signups (2,500 searches), cheap thereafter. **Recommended** (verified live).
- **Google Programmable Search (JSON API)** — was free 100/day, but Google closed
  it to projects created/activated after Jan 2026 (their announced wind-down;
  migrate by Jan 1 2027). Adapter kept for pre-existing projects.
- **SerpApi** — Google results via a licensed API; free tier ~100/month.
- **Brave Search API** — no longer offers a free tier.

## Confidence & safety
- Cross-source agreement raises confidence: 1 listing = low, 2 = medium, 3+ = high.
- Results are cached (positives 30 days, negatives 7 days) to control cost/latency.
- Always a suggestion → human confirm → becomes the shop's product → optional
  shared-catalog candidate. Confirmations, not scraping, build the moat: a
  Pakistani barcode DB grown from real retailer usage.

## Honest coverage note
Public search covers imported/branded items well and many locally-listed items
(e.g. Hashmi Ispaghol resolves cleanly once a search key is set). Truly obscure
local products may still need one manual entry — after which every shop benefits.
