-- =============================================================================
-- Smart Dukaan — Public barcode lookup cache (migration 0013)  [ADDITIVE ONLY]
--
-- Caches results from public/open barcode databases (e.g. Open Food Facts) so a
-- scanned barcode not found locally can be enriched with a name/brand/pack-size
-- suggestion. Cached results are UNVERIFIED and platform-global (a barcode is
-- the same product for everyone); they only PREFILL the create-product form and
-- always require human confirmation. Negative lookups are cached too, to avoid
-- hammering the external API. No existing table/row is modified.
-- =============================================================================

CREATE TABLE IF NOT EXISTS external_barcode_cache (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barcode_normalized TEXT NOT NULL,
  provider           TEXT NOT NULL,
  found              BOOLEAN NOT NULL DEFAULT FALSE,
  product_name       TEXT,
  brand              TEXT,
  pack_size          TEXT,
  quantity_value     NUMERIC(14,3),
  quantity_unit      TEXT,
  image_url          TEXT,
  raw                JSONB,           -- trimmed provider payload (no secrets)
  fetched_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at         TIMESTAMPTZ,
  UNIQUE (barcode_normalized, provider)
);
CREATE INDEX IF NOT EXISTS idx_ext_barcode ON external_barcode_cache(barcode_normalized);
