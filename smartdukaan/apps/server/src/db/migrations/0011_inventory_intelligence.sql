-- =============================================================================
-- Smart Dukaan — Inventory intelligence (migration 0011)  [ADDITIVE ONLY]
--
-- Alerts, deliveries, preferences, actions, forecast evaluations, and a
-- pending purchase-draft table (so reorder suggestions are confirmation-gated
-- and never place a real order). Adds optional product columns. No existing
-- inventory balance, sale, purchase or price is modified; intelligence NEVER
-- writes stock. Older clients need none of these fields.
-- =============================================================================

-- Optional product metadata for intelligence (all nullable/defaulted).
ALTER TABLE products ADD COLUMN IF NOT EXISTS expiry_date DATE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS reorder_qty NUMERIC(14,3);
ALTER TABLE products ADD COLUMN IF NOT EXISTS importance TEXT
  CHECK (importance IS NULL OR importance IN ('essential','important','normal','optional','seasonal'));
ALTER TABLE products ADD COLUMN IF NOT EXISTS intentionally_unstocked BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS last_stock_count_at TIMESTAMPTZ;
ALTER TABLE products ADD COLUMN IF NOT EXISTS supplier_lead_time_days INTEGER;

-- --- Inventory alerts (condition + lifecycle; deduplicated) ------------------
CREATE TABLE IF NOT EXISTS inventory_alerts (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  shop_id            UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  product_id         UUID REFERENCES products(id) ON DELETE CASCADE,
  alert_type         TEXT NOT NULL,
  severity           TEXT NOT NULL CHECK (severity IN ('critical','urgent','important','helpful')),
  dedup_key          TEXT NOT NULL,
  condition_key      TEXT NOT NULL,
  condition_version  TEXT NOT NULL DEFAULT '1',
  explanation        TEXT,
  confidence         TEXT,
  source             TEXT NOT NULL DEFAULT 'deterministic',
  status             TEXT NOT NULL DEFAULT 'generated'
                       CHECK (status IN ('generated','delivered','viewed','acknowledged','snoozed','dismissed','resolved','expired','invalidated')),
  snoozed_until      TIMESTAMPTZ,
  dismiss_count      INTEGER NOT NULL DEFAULT 0,
  generated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at        TIMESTAMPTZ,
  expires_at         TIMESTAMPTZ,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, dedup_key)
);
CREATE INDEX IF NOT EXISTS idx_alerts_shop_status ON inventory_alerts(shop_id, status, severity);
CREATE INDEX IF NOT EXISTS idx_alerts_product ON inventory_alerts(product_id);

-- --- Alert deliveries (delivery state, separate from condition state) --------
CREATE TABLE IF NOT EXISTS alert_deliveries (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id       UUID NOT NULL REFERENCES inventory_alerts(id) ON DELETE CASCADE,
  channel        TEXT NOT NULL CHECK (channel IN ('in_app','local_notification','push','spoken','summary')),
  scheduled_at   TIMESTAMPTZ,
  delivered_at   TIMESTAMPTZ,
  delivery_status TEXT NOT NULL DEFAULT 'pending'
                   CHECK (delivery_status IN ('pending','delivered','failed','suppressed')),
  failure_code   TEXT,
  spoken_language TEXT,
  privacy_mode   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_alert_deliveries_alert ON alert_deliveries(alert_id);

-- --- Alert preferences (per shop; per user optional) ------------------------
CREATE TABLE IF NOT EXISTS alert_preferences (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  shop_id            UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  user_id            UUID REFERENCES users(id) ON DELETE CASCADE,
  preset             TEXT NOT NULL DEFAULT 'recommended'
                       CHECK (preset IN ('essential_only','recommended','all_helpful','custom')),
  spoken_mode        TEXT NOT NULL DEFAULT 'when_open'
                       CHECK (spoken_mode IN ('never','when_open','while_active','summary_time','critical_only')),
  privacy_mode       BOOLEAN NOT NULL DEFAULT FALSE,
  quiet_hours_start  SMALLINT,   -- 0..23 local hour, null = disabled
  quiet_hours_end    SMALLINT,
  daily_summary      BOOLEAN NOT NULL DEFAULT FALSE,
  language           TEXT,
  disabled_types     JSONB,      -- array of alert types the retailer muted
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_alert_pref_scope
  ON alert_preferences(shop_id, COALESCE(user_id, '00000000-0000-0000-0000-000000000000'));

-- --- Alert actions (acknowledge / snooze / dismiss / resolve / draft) --------
CREATE TABLE IF NOT EXISTS alert_actions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id     UUID NOT NULL REFERENCES inventory_alerts(id) ON DELETE CASCADE,
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  shop_id      UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  user_id      UUID REFERENCES users(id) ON DELETE SET NULL,
  action_type  TEXT NOT NULL CHECK (action_type IN (
                 'acknowledge','snooze','dismiss','resolve','open_product','create_draft','change_threshold','mark_unstocked')),
  action_value TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_alert_actions_alert ON alert_actions(alert_id);

-- --- Forecast evaluations (predicted vs actual, for later tuning) ------------
CREATE TABLE IF NOT EXISTS forecast_evaluations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  shop_id           UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  product_id        UUID REFERENCES products(id) ON DELETE CASCADE,
  algorithm         TEXT NOT NULL,
  algorithm_version TEXT NOT NULL,
  forecast_period   TEXT,
  predicted_value   NUMERIC(14,3),
  actual_value      NUMERIC(14,3),
  error_metric      NUMERIC(14,3),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  evaluated_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_forecast_eval_product ON forecast_evaluations(product_id, created_at DESC);

-- --- Purchase drafts (confirmation-gated; NOT a real purchase/order) ---------
CREATE TABLE IF NOT EXISTS purchase_drafts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  shop_id      UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  product_id   UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  supplier_id  UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  quantity     NUMERIC(14,3) NOT NULL CHECK (quantity > 0),
  unit         TEXT,
  source       TEXT NOT NULL DEFAULT 'reorder_suggestion',
  status       TEXT NOT NULL DEFAULT 'draft'
                 CHECK (status IN ('draft','submitted','cancelled','converted')),
  created_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_purchase_drafts_shop ON purchase_drafts(shop_id, status);
CREATE INDEX IF NOT EXISTS idx_purchase_drafts_product ON purchase_drafts(product_id, status) WHERE status IN ('draft','submitted');
