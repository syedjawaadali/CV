-- =============================================================================
-- Smart Dukaan — Product Knowledge Base (migration 0005)  [ADDITIVE ONLY]
--
-- Separates MARKET identity (global product → variant → packaging version) from
-- RETAILER business data (the existing `products` table, untouched except for
-- new NULLABLE reference columns). Adds barcodes (multi), aliases, images
-- (metadata only), price observations, recognition observations/candidates/
-- confirmations, catalog review candidates and a merge ledger.
--
-- Nothing here deletes or rewrites existing rows. Existing product / sale /
-- inventory / barcode behavior is unaffected; every new column is nullable or
-- defaulted. Money stays BIGINT minor units (paisa). Barcodes stay TEXT.
-- =============================================================================

-- --- Catalog sources & trust -------------------------------------------------

CREATE TABLE IF NOT EXISTS catalog_sources (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type     TEXT NOT NULL CHECK (source_type IN (
                    'existing_product_migration','manual_admin','retailer_confirmation',
                    'distributor_catalog','fmcg_catalog','imported','barcode_observation',
                    'future_ocr','future_cloud_ai')),
  source_name     TEXT NOT NULL,
  external_reference TEXT,
  trust_level     TEXT NOT NULL DEFAULT 'unknown' CHECK (trust_level IN (
                    'unknown','retailer_local','retailer_confirmed','multi_retailer',
                    'distributor','manufacturer','platform_reviewed','official')),
  organization_id UUID,
  import_batch_id UUID,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_catalog_sources_type_name ON catalog_sources(source_type, lower(source_name));

-- --- Global product / variant / packaging version ----------------------------

CREATE TABLE IF NOT EXISTS global_products (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_name           TEXT NOT NULL,
  canonical_name_normalized TEXT NOT NULL,
  urdu_name                TEXT,
  roman_urdu_name          TEXT,
  description              TEXT,
  brand                    TEXT,
  category                 TEXT,
  manufacturer             TEXT,
  product_type             TEXT,
  catalog_status           TEXT NOT NULL DEFAULT 'active' CHECK (catalog_status IN (
                             'active','inactive','retired','merged','suspicious')),
  verification_status      TEXT NOT NULL DEFAULT 'unverified' CHECK (verification_status IN (
                             'unverified','retailer_confirmed','multi_retailer','distributor',
                             'manufacturer','admin_reviewed','verified','conflicted','suspicious','retired')),
  source_id                UUID REFERENCES catalog_sources(id) ON DELETE SET NULL,
  merged_into_id           UUID REFERENCES global_products(id) ON DELETE SET NULL,
  country_code             TEXT DEFAULT 'PK',
  is_active                BOOLEAN NOT NULL DEFAULT TRUE,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  version                  INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_global_products_norm ON global_products(canonical_name_normalized);
CREATE INDEX IF NOT EXISTS idx_global_products_brand ON global_products(lower(brand));

CREATE TABLE IF NOT EXISTS product_variants (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  global_product_id      UUID NOT NULL REFERENCES global_products(id) ON DELETE CASCADE,
  variant_name           TEXT NOT NULL,
  variant_name_normalized TEXT NOT NULL,
  flavor                 TEXT,
  fragrance              TEXT,
  color_descriptor       TEXT,
  pack_quantity          NUMERIC(14,3),
  pack_unit              TEXT,
  base_quantity          NUMERIC(14,3),
  base_unit              TEXT CHECK (base_unit IN ('g','ml','piece') OR base_unit IS NULL),
  units_per_pack         INTEGER NOT NULL DEFAULT 1 CHECK (units_per_pack > 0),
  container_type         TEXT,
  product_form           TEXT CHECK (product_form IN (
                           'powder','liquid','bar','bottle','packet','box','carton',
                           'loose','service','other') OR product_form IS NULL),
  sku_reference          TEXT,
  verification_status    TEXT NOT NULL DEFAULT 'unverified',
  source_id              UUID REFERENCES catalog_sources(id) ON DELETE SET NULL,
  is_active              BOOLEAN NOT NULL DEFAULT TRUE,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  version                INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_variants_global ON product_variants(global_product_id);
CREATE INDEX IF NOT EXISTS idx_variants_norm ON product_variants(variant_name_normalized);

CREATE TABLE IF NOT EXISTS packaging_versions (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_variant_id       UUID NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  packaging_version_label  TEXT,
  primary_color_description TEXT,
  packaging_text_summary   TEXT,
  printed_size_text        TEXT,
  printed_price_text       TEXT,
  valid_from               DATE,
  valid_until              DATE,
  verification_status      TEXT NOT NULL DEFAULT 'unverified',
  source_id                UUID REFERENCES catalog_sources(id) ON DELETE SET NULL,
  is_current               BOOLEAN NOT NULL DEFAULT FALSE,
  is_promotional           BOOLEAN NOT NULL DEFAULT FALSE,
  is_suspicious            BOOLEAN NOT NULL DEFAULT FALSE,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  version                  INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_packaging_variant ON packaging_versions(product_variant_id);

-- --- Retailer product KB references (existing table, additive columns) --------

ALTER TABLE products ADD COLUMN IF NOT EXISTS global_product_id UUID REFERENCES global_products(id) ON DELETE SET NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS product_variant_id UUID REFERENCES product_variants(id) ON DELETE SET NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS preferred_packaging_version_id UUID REFERENCES packaging_versions(id) ON DELETE SET NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS catalog_match_status TEXT NOT NULL DEFAULT 'unmatched'
  CHECK (catalog_match_status IN ('unmatched','suggested','confirmed','conflicted','retailer_only'));
ALTER TABLE products ADD COLUMN IF NOT EXISTS catalog_match_source TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS last_catalog_confirmation_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_products_variant ON products(product_variant_id);
CREATE INDEX IF NOT EXISTS idx_products_match_status ON products(shop_id, catalog_match_status);

-- --- Barcodes (multi, scoped) ------------------------------------------------

CREATE TABLE IF NOT EXISTS product_barcodes (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barcode_value       TEXT NOT NULL,
  barcode_normalized  TEXT NOT NULL,
  barcode_format      TEXT,
  classification      TEXT NOT NULL DEFAULT 'unknown_format' CHECK (classification IN (
                        'standard_valid','standard_invalid','internal_code','unknown_format','empty')),
  product_variant_id  UUID REFERENCES product_variants(id) ON DELETE CASCADE,
  packaging_version_id UUID REFERENCES packaging_versions(id) ON DELETE SET NULL,
  retailer_product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  tenant_id           UUID REFERENCES tenants(id) ON DELETE CASCADE,
  shop_id             UUID REFERENCES shops(id) ON DELETE CASCADE,
  ownership_scope     TEXT NOT NULL DEFAULT 'retailer' CHECK (ownership_scope IN ('global','retailer')),
  verification_status TEXT NOT NULL DEFAULT 'unverified',
  is_conflicted       BOOLEAN NOT NULL DEFAULT FALSE,
  source_id           UUID REFERENCES catalog_sources(id) ON DELETE SET NULL,
  first_observed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_observed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  observation_count   INTEGER NOT NULL DEFAULT 1 CHECK (observation_count >= 0),
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_barcodes_norm ON product_barcodes(barcode_normalized);
-- Prevent duplicate rows within scope, but ALLOW the same barcode across
-- different variants (a real conflict) and across different retailers.
CREATE UNIQUE INDEX IF NOT EXISTS uq_barcodes_global
  ON product_barcodes(barcode_normalized, product_variant_id)
  WHERE ownership_scope = 'global';
CREATE UNIQUE INDEX IF NOT EXISTS uq_barcodes_retailer
  ON product_barcodes(barcode_normalized, retailer_product_id)
  WHERE ownership_scope = 'retailer';

-- --- Aliases -----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS product_aliases (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  global_product_id   UUID REFERENCES global_products(id) ON DELETE CASCADE,
  product_variant_id  UUID REFERENCES product_variants(id) ON DELETE CASCADE,
  retailer_product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  tenant_id           UUID REFERENCES tenants(id) ON DELETE CASCADE,
  shop_id             UUID REFERENCES shops(id) ON DELETE CASCADE,
  alias_text          TEXT NOT NULL,
  normalized_alias    TEXT NOT NULL,
  language_code       TEXT,
  script_type         TEXT,
  alias_type          TEXT NOT NULL DEFAULT 'common' CHECK (alias_type IN (
                        'official','common','short','urdu','roman_urdu','retailer',
                        'voice','ocr','misspelling','abbreviation')),
  ownership_scope     TEXT NOT NULL DEFAULT 'retailer' CHECK (ownership_scope IN ('global','retailer')),
  verification_status TEXT NOT NULL DEFAULT 'unverified',
  source_id           UUID REFERENCES catalog_sources(id) ON DELETE SET NULL,
  usage_count         INTEGER NOT NULL DEFAULT 0 CHECK (usage_count >= 0),
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_aliases_norm ON product_aliases(normalized_alias);
CREATE UNIQUE INDEX IF NOT EXISTS uq_aliases_global
  ON product_aliases(normalized_alias, global_product_id) WHERE ownership_scope = 'global';
CREATE UNIQUE INDEX IF NOT EXISTS uq_aliases_retailer
  ON product_aliases(normalized_alias, retailer_product_id) WHERE ownership_scope = 'retailer';

-- --- Product images (METADATA ONLY — no embeddings in Phase 2) ----------------

CREATE TABLE IF NOT EXISTS product_images (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  global_product_id   UUID REFERENCES global_products(id) ON DELETE CASCADE,
  product_variant_id  UUID REFERENCES product_variants(id) ON DELETE CASCADE,
  packaging_version_id UUID REFERENCES packaging_versions(id) ON DELETE CASCADE,
  retailer_product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  tenant_id           UUID REFERENCES tenants(id) ON DELETE CASCADE,
  shop_id             UUID REFERENCES shops(id) ON DELETE CASCADE,
  storage_reference   TEXT,
  thumbnail_reference TEXT,
  image_type          TEXT,
  mime_type           TEXT,
  file_size           BIGINT CHECK (file_size IS NULL OR file_size >= 0),
  width               INTEGER,
  height              INTEGER,
  content_hash        TEXT,
  perceptual_hash     TEXT, -- placeholder; computed in a later phase
  source_id           UUID REFERENCES catalog_sources(id) ON DELETE SET NULL,
  verification_status TEXT NOT NULL DEFAULT 'unverified',
  capture_angle       TEXT,
  is_primary          BOOLEAN NOT NULL DEFAULT FALSE,
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_images_variant ON product_images(product_variant_id);
CREATE INDEX IF NOT EXISTS idx_images_content_hash ON product_images(content_hash);

-- --- Price observations (append-only history) --------------------------------

CREATE TABLE IF NOT EXISTS price_observations (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_variant_id  UUID REFERENCES product_variants(id) ON DELETE SET NULL,
  packaging_version_id UUID REFERENCES packaging_versions(id) ON DELETE SET NULL,
  retailer_product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  tenant_id           UUID REFERENCES tenants(id) ON DELETE CASCADE,
  shop_id             UUID REFERENCES shops(id) ON DELETE CASCADE,
  price_type          TEXT NOT NULL CHECK (price_type IN (
                        'printed_mrp','retailer_selling','purchase_cost','distributor',
                        'promotional','suggested')),
  amount_minor        BIGINT NOT NULL CHECK (amount_minor >= 0),
  currency            TEXT NOT NULL DEFAULT 'PKR',
  observation_source  TEXT NOT NULL DEFAULT 'manual',
  observed_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_from          TIMESTAMPTZ,
  valid_until         TIMESTAMPTZ,
  is_current          BOOLEAN NOT NULL DEFAULT TRUE,
  confidence          NUMERIC(4,3) CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  confirmed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  source_id           UUID REFERENCES catalog_sources(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_price_obs_retailer ON price_observations(retailer_product_id, price_type, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_price_obs_current ON price_observations(retailer_product_id, price_type) WHERE is_current;

-- --- Recognition observations / candidates / confirmations --------------------

CREATE TABLE IF NOT EXISTS recognition_observations (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  shop_id              UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  user_id              UUID REFERENCES users(id) ON DELETE SET NULL,
  device_id            TEXT,
  observation_type     TEXT NOT NULL CHECK (observation_type IN (
                         'barcode','manual_search','manual_selection','existing_import',
                         'ocr','image','voice','cloud_ai','combined')),
  raw_value            TEXT,
  normalized_value     TEXT,
  barcode_value        TEXT,
  candidate_count      INTEGER NOT NULL DEFAULT 0 CHECK (candidate_count >= 0),
  selected_candidate_id UUID,
  confidence           NUMERIC(4,3) CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  status               TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','unmatched','invalid')),
  source_id            UUID REFERENCES catalog_sources(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at          TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_recog_obs_shop_created ON recognition_observations(shop_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recog_obs_barcode ON recognition_observations(barcode_value);

CREATE TABLE IF NOT EXISTS recognition_candidates (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  observation_id      UUID NOT NULL REFERENCES recognition_observations(id) ON DELETE CASCADE,
  global_product_id   UUID REFERENCES global_products(id) ON DELETE SET NULL,
  product_variant_id  UUID REFERENCES product_variants(id) ON DELETE SET NULL,
  packaging_version_id UUID REFERENCES packaging_versions(id) ON DELETE SET NULL,
  retailer_product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  candidate_rank      INTEGER NOT NULL DEFAULT 1 CHECK (candidate_rank >= 1),
  confidence          NUMERIC(4,3) CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  match_reasons       JSONB,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_recog_cand_obs ON recognition_candidates(observation_id, candidate_rank);

CREATE TABLE IF NOT EXISTS recognition_confirmations (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  observation_id           UUID REFERENCES recognition_observations(id) ON DELETE SET NULL,
  tenant_id                UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  shop_id                  UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  user_id                  UUID REFERENCES users(id) ON DELETE SET NULL,
  confirmed_global_product_id UUID REFERENCES global_products(id) ON DELETE SET NULL,
  confirmed_variant_id     UUID REFERENCES product_variants(id) ON DELETE SET NULL,
  confirmed_packaging_version_id UUID REFERENCES packaging_versions(id) ON DELETE SET NULL,
  confirmed_retailer_product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  confirmation_action      TEXT NOT NULL CHECK (confirmation_action IN (
                             'confirmed_suggested','selected_different','created_retailer_product',
                             'created_review_candidate','rejected_all','marked_invalid')),
  previous_candidate_id    UUID REFERENCES recognition_candidates(id) ON DELETE SET NULL,
  correction_reason        TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_recog_conf_shop ON recognition_confirmations(shop_id, created_at DESC);

-- --- Catalog review candidates (never auto-published) ------------------------

CREATE TABLE IF NOT EXISTS catalog_review_candidates (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_type      TEXT NOT NULL CHECK (candidate_type IN (
                        'new_product','alias','barcode','correction','packaging_version','merge')),
  proposed_action     TEXT,
  source_observation_id UUID REFERENCES recognition_observations(id) ON DELETE SET NULL,
  proposed_global_product_id UUID REFERENCES global_products(id) ON DELETE SET NULL,
  proposed_variant_id UUID REFERENCES product_variants(id) ON DELETE SET NULL,
  proposed_packaging_version_id UUID REFERENCES packaging_versions(id) ON DELETE SET NULL,
  proposed_barcode    TEXT,
  proposed_alias      TEXT,
  proposed_data       JSONB,
  tenant_id           UUID REFERENCES tenants(id) ON DELETE SET NULL,
  shop_id             UUID REFERENCES shops(id) ON DELETE SET NULL,
  created_by          UUID REFERENCES users(id) ON DELETE SET NULL,
  confirmation_count  INTEGER NOT NULL DEFAULT 1 CHECK (confirmation_count >= 0),
  conflict_count      INTEGER NOT NULL DEFAULT 0 CHECK (conflict_count >= 0),
  review_status       TEXT NOT NULL DEFAULT 'pending' CHECK (review_status IN (
                        'pending','approved','rejected','conflicted')),
  reviewed_by         UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at         TIMESTAMPTZ,
  review_notes        TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_review_status ON catalog_review_candidates(review_status, created_at DESC);

-- --- Merge ledger ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS product_merges (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type    TEXT NOT NULL CHECK (entity_type IN ('global_product','product_variant')),
  source_id      UUID NOT NULL,
  destination_id UUID NOT NULL,
  reason         TEXT,
  performed_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  details        JSONB,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_merges_source ON product_merges(entity_type, source_id);
