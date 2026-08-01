-- =============================================================================
-- Smart Dukaan — Visual matching + Cloud AI governance (migration 0008)
-- [ADDITIVE ONLY]
--
-- Adds local image fingerprints, optional visual embeddings, and the full
-- cloud-AI governance surface (usage, budgets, provider health, cost config,
-- prompt registry, result cache, request log, consent, image-safety). No
-- existing table or row is modified; every table/column is create-if-not-exists.
-- Cloud AI is OFF by default at the feature-flag layer — these tables only
-- store evidence and governance state, never business truth.
-- =============================================================================

-- --- Local image fingerprints -----------------------------------------------
-- A fingerprint is a hash of a product image, owned either by a retailer
-- (retailer_product_id + tenant/shop) or by the shared catalog (product_variant
-- / packaging_version). Perceptual hashes are algorithm+version tagged so
-- incompatible hashes are never compared as equivalent.
CREATE TABLE IF NOT EXISTS image_fingerprints (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID REFERENCES tenants(id) ON DELETE CASCADE,
  shop_id              UUID REFERENCES shops(id) ON DELETE CASCADE,
  retailer_product_id  UUID REFERENCES products(id) ON DELETE CASCADE,
  product_variant_id   UUID REFERENCES product_variants(id) ON DELETE CASCADE,
  packaging_version_id UUID REFERENCES packaging_versions(id) ON DELETE CASCADE,
  image_id             UUID REFERENCES product_images(id) ON DELETE CASCADE,
  ownership_scope      TEXT NOT NULL DEFAULT 'retailer'
                         CHECK (ownership_scope IN ('retailer','global')),
  content_hash         TEXT,          -- sha256 hex of the normalized image bytes
  perceptual_hash      TEXT,          -- hex bit-string
  phash_algorithm      TEXT,          -- 'ahash' | 'dhash'
  phash_version        TEXT,
  image_type           TEXT,          -- front/back/side/barcode/price/product/promo/...
  verification_status  TEXT NOT NULL DEFAULT 'unverified',
  capture_country      TEXT DEFAULT 'PK',
  is_active            BOOLEAN NOT NULL DEFAULT TRUE,
  retention_status     TEXT NOT NULL DEFAULT 'active'
                         CHECK (retention_status IN ('active','retired','deleted')),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fp_content ON image_fingerprints(content_hash) WHERE content_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fp_perceptual ON image_fingerprints(perceptual_hash) WHERE perceptual_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fp_retailer ON image_fingerprints(shop_id, retailer_product_id) WHERE shop_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fp_variant ON image_fingerprints(product_variant_id) WHERE product_variant_id IS NOT NULL;

-- --- Optional visual embeddings (model-versioned; never cross-compared) ------
CREATE TABLE IF NOT EXISTS image_embeddings (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint_id       UUID REFERENCES image_fingerprints(id) ON DELETE CASCADE,
  product_variant_id   UUID REFERENCES product_variants(id) ON DELETE CASCADE,
  packaging_version_id UUID REFERENCES packaging_versions(id) ON DELETE CASCADE,
  image_id             UUID REFERENCES product_images(id) ON DELETE CASCADE,
  model_name           TEXT NOT NULL,
  model_version        TEXT NOT NULL,
  vector_dim           INTEGER NOT NULL CHECK (vector_dim > 0 AND vector_dim <= 4096),
  vector               JSONB NOT NULL,   -- normalized float array; no pgvector dependency assumed
  verification_status  TEXT NOT NULL DEFAULT 'unverified',
  is_active            BOOLEAN NOT NULL DEFAULT TRUE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_embed_model ON image_embeddings(model_name, model_version) WHERE is_active;

-- --- Embedding model registry -----------------------------------------------
CREATE TABLE IF NOT EXISTS embedding_models (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_name    TEXT NOT NULL,
  model_version TEXT NOT NULL,
  vector_dim    INTEGER NOT NULL,
  license       TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT FALSE,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (model_name, model_version)
);

-- --- Cloud prompt registry (versioned; never edited in place) ----------------
CREATE TABLE IF NOT EXISTS cloud_prompt_versions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_key     TEXT NOT NULL,
  version        TEXT NOT NULL,
  purpose        TEXT,
  provider       TEXT,
  model          TEXT,
  system_text    TEXT NOT NULL,
  output_schema  TEXT,
  safety_rules   TEXT,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  introduced_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (prompt_key, version)
);

-- --- Cloud AI cost configuration (versioned; integer minor units) ------------
CREATE TABLE IF NOT EXISTS ai_cost_config (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider           TEXT NOT NULL,
  model              TEXT NOT NULL,
  per_image_minor    BIGINT NOT NULL DEFAULT 0 CHECK (per_image_minor >= 0),
  per_1k_input_minor BIGINT NOT NULL DEFAULT 0 CHECK (per_1k_input_minor >= 0),
  per_1k_output_minor BIGINT NOT NULL DEFAULT 0 CHECK (per_1k_output_minor >= 0),
  min_charge_minor   BIGINT NOT NULL DEFAULT 0 CHECK (min_charge_minor >= 0),
  currency           TEXT NOT NULL DEFAULT 'PKR',
  effective_date     DATE,
  source_note        TEXT,
  is_active          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- --- Cloud AI budgets (per platform/tenant/shop) -----------------------------
CREATE TABLE IF NOT EXISTS ai_budgets (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope                 TEXT NOT NULL CHECK (scope IN ('platform','tenant','shop')),
  tenant_id             UUID REFERENCES tenants(id) ON DELETE CASCADE,
  shop_id               UUID REFERENCES shops(id) ON DELETE CASCADE,
  period_type           TEXT NOT NULL DEFAULT 'daily' CHECK (period_type IN ('daily','monthly')),
  request_limit         INTEGER NOT NULL DEFAULT 0 CHECK (request_limit >= 0),
  estimated_cost_limit_minor BIGINT NOT NULL DEFAULT 0 CHECK (estimated_cost_limit_minor >= 0),
  used_requests         INTEGER NOT NULL DEFAULT 0 CHECK (used_requests >= 0),
  used_estimated_cost_minor  BIGINT NOT NULL DEFAULT 0 CHECK (used_estimated_cost_minor >= 0),
  reserved_requests     INTEGER NOT NULL DEFAULT 0 CHECK (reserved_requests >= 0),
  reserved_cost_minor   BIGINT NOT NULL DEFAULT 0 CHECK (reserved_cost_minor >= 0),
  warning_threshold_pct INTEGER NOT NULL DEFAULT 80 CHECK (warning_threshold_pct BETWEEN 0 AND 100),
  hard_limit            BOOLEAN NOT NULL DEFAULT TRUE,
  currency              TEXT NOT NULL DEFAULT 'PKR',
  period_key            TEXT NOT NULL,     -- e.g. '2026-08-01' or '2026-08'
  reset_at              TIMESTAMPTZ,
  policy_version        TEXT NOT NULL DEFAULT '1',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_budget_scope
  ON ai_budgets(scope, COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'),
                COALESCE(shop_id, '00000000-0000-0000-0000-000000000000'), period_type, period_key);

-- --- Cloud AI usage events (append-only) -------------------------------------
CREATE TABLE IF NOT EXISTS ai_usage_events (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID REFERENCES tenants(id) ON DELETE CASCADE,
  shop_id               UUID REFERENCES shops(id) ON DELETE CASCADE,
  user_id               UUID REFERENCES users(id) ON DELETE SET NULL,
  device_id             TEXT,
  recognition_session_id TEXT,
  observation_id        UUID REFERENCES recognition_observations(id) ON DELETE SET NULL,
  provider              TEXT NOT NULL,
  model                 TEXT,
  model_version         TEXT,
  prompt_version        TEXT,
  request_type          TEXT NOT NULL DEFAULT 'analyze_product_image',
  input_image_count     INTEGER NOT NULL DEFAULT 0,
  input_image_bytes     BIGINT NOT NULL DEFAULT 0,
  input_text_bytes      BIGINT NOT NULL DEFAULT 0,
  output_bytes          BIGINT NOT NULL DEFAULT 0,
  estimated_cost_minor  BIGINT NOT NULL DEFAULT 0 CHECK (estimated_cost_minor >= 0),
  actual_cost_minor     BIGINT,
  cost_currency         TEXT NOT NULL DEFAULT 'PKR',
  latency_ms            INTEGER,
  cache_status          TEXT NOT NULL DEFAULT 'miss'
                          CHECK (cache_status IN ('hit','miss','dedup','n/a')),
  fallback_reason       TEXT,
  result_status         TEXT NOT NULL DEFAULT 'completed',
  error_code            TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_usage_tenant_date ON ai_usage_events(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_shop_date ON ai_usage_events(shop_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_status ON ai_usage_events(provider, result_status);

-- --- Provider health (circuit breaker state) ---------------------------------
CREATE TABLE IF NOT EXISTS ai_provider_health (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider          TEXT NOT NULL,
  model             TEXT NOT NULL DEFAULT '',
  health_status     TEXT NOT NULL DEFAULT 'closed'
                      CHECK (health_status IN ('closed','open','half_open')),
  failure_count     INTEGER NOT NULL DEFAULT 0,
  success_count     INTEGER NOT NULL DEFAULT 0,
  last_success_at   TIMESTAMPTZ,
  last_failure_at   TIMESTAMPTZ,
  circuit_open_until TIMESTAMPTZ,
  avg_latency_ms    INTEGER,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, model)
);

-- --- Cloud result cache (safe, reusable recognition results) -----------------
CREATE TABLE IF NOT EXISTS ai_result_cache (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key          TEXT NOT NULL,      -- hash(content_hash|ocr_hash|provider|model|prompt|candidate_set|country)
  content_hash       TEXT,
  perceptual_hash    TEXT,
  ocr_text_hash      TEXT,
  provider           TEXT NOT NULL,
  model              TEXT,
  model_version      TEXT,
  prompt_version     TEXT,
  candidate_set_version TEXT,
  country            TEXT DEFAULT 'PK',
  result             JSONB NOT NULL,     -- validated structured result only (no chain-of-thought)
  confidence_category TEXT,
  verification_status TEXT NOT NULL DEFAULT 'unverified',
  usage_count        INTEGER NOT NULL DEFAULT 0,
  invalidated        BOOLEAN NOT NULL DEFAULT FALSE,
  last_used_at       TIMESTAMPTZ,
  expires_at         TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (cache_key)
);
CREATE INDEX IF NOT EXISTS idx_cache_content ON ai_result_cache(content_hash) WHERE content_hash IS NOT NULL;

-- --- Cloud recognition requests (state + minimized inputs + validated result)-
CREATE TABLE IF NOT EXISTS cloud_recognition_requests (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  shop_id             UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  user_id             UUID REFERENCES users(id) ON DELETE SET NULL,
  observation_id      UUID REFERENCES recognition_observations(id) ON DELETE SET NULL,
  recognition_session_id TEXT,
  idempotency_key     TEXT,
  content_hash        TEXT,
  provider            TEXT,
  model               TEXT,
  prompt_version      TEXT,
  status              TEXT NOT NULL DEFAULT 'eligible'
                        CHECK (status IN ('eligible','not_eligible','budget_blocked','rate_limited',
                          'queued','processing','completed','cached','failed','cancelled','timed_out',
                          'provider_unavailable','schema_invalid','safety_rejected')),
  not_eligible_reason TEXT,
  safety_flags        JSONB,
  request_id          TEXT,
  response_id         TEXT,
  validated_result    JSONB,
  validation_status   TEXT,
  estimated_cost_minor BIGINT NOT NULL DEFAULT 0,
  latency_ms          INTEGER,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at        TIMESTAMPTZ,
  UNIQUE (tenant_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_cloud_req_shop ON cloud_recognition_requests(shop_id, created_at DESC);

-- --- Cloud consent preferences (per shop; per user optional) ------------------
CREATE TABLE IF NOT EXISTS cloud_consent_preferences (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  shop_id            UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  user_id            UUID REFERENCES users(id) ON DELETE CASCADE,
  cloud_mode         TEXT NOT NULL DEFAULT 'ask'
                       CHECK (cloud_mode IN ('always','ask','never')),
  wifi_only          BOOLEAN NOT NULL DEFAULT FALSE,
  save_confirmed_image BOOLEAN NOT NULL DEFAULT FALSE,
  updated_by         UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_cloud_consent_scope
  ON cloud_consent_preferences(shop_id, COALESCE(user_id, '00000000-0000-0000-0000-000000000000'));

-- --- Image safety results (heuristic; never claims perfect detection) ---------
CREATE TABLE IF NOT EXISTS image_safety_results (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID REFERENCES tenants(id) ON DELETE CASCADE,
  shop_id        UUID REFERENCES shops(id) ON DELETE CASCADE,
  content_hash   TEXT,
  flags          JSONB,
  blocked        BOOLEAN NOT NULL DEFAULT FALSE,
  reason         TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
