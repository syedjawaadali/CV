-- =============================================================================
-- Smart Dukaan — Online ordering + customer accounts (migration 0003)
--
-- Buyer-facing storefront: customers (separate from retailer staff `users`)
-- sign up with a phone number, browse a shop, and place an advance order. A
-- 30% advance confirms the order. Payment is SIMULATED for now (no gateway) —
-- `advance_paid` flips on the simulated step; a real gateway drops in later.
-- =============================================================================

CREATE TABLE IF NOT EXISTS customer_accounts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone         TEXT NOT NULL,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_accounts_phone ON customer_accounts(phone);

CREATE TABLE IF NOT EXISTS orders (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id             UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  customer_account_id UUID NOT NULL REFERENCES customer_accounts(id) ON DELETE CASCADE,
  customer_name       TEXT NOT NULL,
  customer_phone      TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'pending_payment'
                        CHECK (status IN ('pending_payment','confirmed','accepted','ready','fulfilled','rejected','cancelled')),
  subtotal_minor      BIGINT NOT NULL CHECK (subtotal_minor >= 0),
  advance_minor       BIGINT NOT NULL CHECK (advance_minor >= 0),
  advance_paid        BOOLEAN NOT NULL DEFAULT FALSE,
  advance_paid_at     TIMESTAMPTZ,
  note                TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_orders_shop_created ON orders(shop_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_customer_created ON orders(customer_account_id, created_at DESC);

CREATE TABLE IF NOT EXISTS order_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id         UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id       UUID REFERENCES products(id) ON DELETE SET NULL,
  name             TEXT NOT NULL,
  quantity         NUMERIC(14,3) NOT NULL CHECK (quantity > 0),
  unit_price_minor BIGINT NOT NULL CHECK (unit_price_minor >= 0),
  line_total_minor BIGINT NOT NULL CHECK (line_total_minor >= 0)
);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
