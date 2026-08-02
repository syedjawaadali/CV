-- =============================================================================
-- Smart Dukaan — Store memory & self-learning (migration 0012)  [ADDITIVE ONLY]
--
-- Extends voice_memory with rejection/confidence/expiry/version fields, and adds
-- recognition_feedback: per-shop confirmed/rejected product signals that nudge
-- LOCAL candidate ranking. Learning is retailer-scoped and never becomes global
-- truth, never changes financial/inventory/catalog records, and never overrides
-- a hard recognition contradiction. Older clients need none of these fields.
-- =============================================================================

ALTER TABLE voice_memory ADD COLUMN IF NOT EXISTS rejection_count INTEGER NOT NULL DEFAULT 0 CHECK (rejection_count >= 0);
ALTER TABLE voice_memory ADD COLUMN IF NOT EXISTS confidence TEXT;
ALTER TABLE voice_memory ADD COLUMN IF NOT EXISTS review_at TIMESTAMPTZ;
ALTER TABLE voice_memory ADD COLUMN IF NOT EXISTS model_version TEXT;
ALTER TABLE voice_memory ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ;
ALTER TABLE voice_memory ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'user';

-- Per-shop, per-product recognition feedback (confirmed / rejected). Tenant-scoped;
-- one shop's feedback never affects another's ranking.
CREATE TABLE IF NOT EXISTS recognition_feedback (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  shop_id        UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  product_id     UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  feedback_type  TEXT NOT NULL CHECK (feedback_type IN ('confirmed','rejected')),
  count          INTEGER NOT NULL DEFAULT 1 CHECK (count >= 0),
  last_input     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (shop_id, product_id, feedback_type)
);
CREATE INDEX IF NOT EXISTS idx_recog_feedback_shop ON recognition_feedback(shop_id, product_id);
