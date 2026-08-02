-- =============================================================================
-- Smart Dukaan — Voice assistant (migration 0010)  [ADDITIVE ONLY]
--
-- Voice sessions, transcripts, intents, entities, actions and store-specific
-- language memory. Cloud voice usage reuses ai_usage_events (Phase 4). No
-- existing table/row is modified; every table is create-if-not-exists and older
-- clients never need to send voice fields.
-- =============================================================================

CREATE TABLE IF NOT EXISTS voice_sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  shop_id       UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  user_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  device_id     TEXT,
  language      TEXT,
  provider      TEXT,
  mode          TEXT,
  status        TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','completed','cancelled','failed','expired')),
  privacy_mode  BOOLEAN NOT NULL DEFAULT FALSE,
  offline       BOOLEAN NOT NULL DEFAULT FALSE,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at      TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_voice_sessions_shop ON voice_sessions(shop_id, started_at DESC);

CREATE TABLE IF NOT EXISTS voice_transcripts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id     UUID NOT NULL REFERENCES voice_sessions(id) ON DELETE CASCADE,
  original_text  TEXT,
  normalized_text TEXT,
  language       TEXT,
  script         TEXT,
  provider       TEXT,
  confidence     NUMERIC(4,3),
  is_final       BOOLEAN NOT NULL DEFAULT TRUE,
  retention_status TEXT NOT NULL DEFAULT 'active',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_voice_transcripts_session ON voice_transcripts(session_id);

CREATE TABLE IF NOT EXISTS voice_intents (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id         UUID NOT NULL REFERENCES voice_sessions(id) ON DELETE CASCADE,
  intent_name        TEXT NOT NULL,
  intent_version     TEXT NOT NULL DEFAULT '1',
  domain             TEXT,
  confidence         NUMERIC(4,3),
  required_permission TEXT,
  confirmation_level TEXT,
  status             TEXT NOT NULL DEFAULT 'open',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_voice_intents_session ON voice_intents(session_id);

CREATE TABLE IF NOT EXISTS voice_entities (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intent_id          UUID NOT NULL REFERENCES voice_intents(id) ON DELETE CASCADE,
  entity_type        TEXT NOT NULL,
  original_value     TEXT,
  normalized_value   TEXT,
  resolved_reference UUID,
  confidence         NUMERIC(4,3),
  ambiguous          BOOLEAN NOT NULL DEFAULT FALSE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS voice_actions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  shop_id            UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  user_id            UUID REFERENCES users(id) ON DELETE SET NULL,
  session_id         UUID REFERENCES voice_sessions(id) ON DELETE SET NULL,
  intent_name        TEXT NOT NULL,
  action_type        TEXT NOT NULL,
  action_payload     JSONB NOT NULL,
  action_preview     TEXT,
  confirmation_status TEXT NOT NULL DEFAULT 'pending'
                       CHECK (confirmation_status IN ('pending','confirmed','cancelled','expired')),
  execution_status   TEXT NOT NULL DEFAULT 'not_started'
                       CHECK (execution_status IN ('not_started','executing','completed','failed','pending_sync')),
  confirmation_token TEXT NOT NULL,
  idempotency_key    TEXT NOT NULL,
  executed_reference TEXT,
  expires_at         TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  executed_at        TIMESTAMPTZ,
  UNIQUE (tenant_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_voice_actions_shop ON voice_actions(shop_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_voice_actions_status ON voice_actions(confirmation_status, execution_status);

-- Store-specific language memory: pronunciation/alias mappings, confirmation-gated.
CREATE TABLE IF NOT EXISTS voice_memory (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  shop_id            UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  memory_type        TEXT NOT NULL
                       CHECK (memory_type IN ('product_alias','customer_alias','supplier_alias','preference')),
  spoken_form        TEXT NOT NULL,
  spoken_form_normalized TEXT NOT NULL,
  normalized_form    TEXT,
  resolved_reference UUID,
  language           TEXT,
  confirmation_count INTEGER NOT NULL DEFAULT 1 CHECK (confirmation_count >= 0),
  user_approved      BOOLEAN NOT NULL DEFAULT FALSE,
  active             BOOLEAN NOT NULL DEFAULT TRUE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (shop_id, memory_type, spoken_form_normalized)
);
CREATE INDEX IF NOT EXISTS idx_voice_memory_lookup ON voice_memory(shop_id, memory_type, spoken_form_normalized) WHERE active;
