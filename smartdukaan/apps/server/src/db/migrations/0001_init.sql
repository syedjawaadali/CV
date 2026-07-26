-- =============================================================================
-- Smart Dukaan — Retailer Core schema (migration 0001)
--
-- Principles:
--  * Every business table carries tenant_id (+ shop_id) for isolation.
--  * Money is stored as BIGINT minor units (paisa). No floating point.
--  * Financial + inventory movement tables are APPEND-ONLY. Corrections are
--    made with reversal / adjustment rows, never by editing posted history.
--  * Cached balances (customers.balance_minor, products.stock_qty) are always
--    reconstructable by summing khata_transactions / inventory_movements.
--  * Timestamps are timestamptz stored in UTC.
-- =============================================================================

-- gen_random_uuid() is built into PostgreSQL 13+.

-- --- Tenancy & identity ------------------------------------------------------

CREATE TABLE IF NOT EXISTS tenants (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS shops (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  category    TEXT,
  address     TEXT,
  phone       TEXT,
  language    TEXT NOT NULL DEFAULT 'en' CHECK (language IN ('en','ur')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_shops_tenant ON shops(tenant_id);

CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  shop_id       UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('owner','manager','cashier','inventory','viewer')),
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  language      TEXT NOT NULL DEFAULT 'en' CHECK (language IN ('en','ur')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email ON users(lower(email));
CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_shop ON users(shop_id);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL,
  user_agent  TEXT,
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_refresh_user ON refresh_tokens(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_refresh_hash ON refresh_tokens(token_hash);

-- Per-shop monotonic counter for receipt numbers (locked in the sale txn).
CREATE TABLE IF NOT EXISTS shop_counters (
  shop_id   UUID PRIMARY KEY REFERENCES shops(id) ON DELETE CASCADE,
  sale_seq  BIGINT NOT NULL DEFAULT 0
);

-- --- Customers ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS customers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  shop_id       UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  phone         TEXT,
  locality      TEXT,
  note          TEXT,
  balance_minor BIGINT NOT NULL DEFAULT 0, -- cached; = SUM(khata_transactions.amount_minor)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_customers_shop_name ON customers(shop_id, lower(name));
CREATE INDEX IF NOT EXISTS idx_customers_shop_phone ON customers(shop_id, phone);

-- --- Products ----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS products (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  shop_id              UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  name                 TEXT NOT NULL,
  name_ur              TEXT,
  barcode              TEXT,
  category             TEXT,
  unit                 TEXT NOT NULL DEFAULT 'piece',
  cost_price_minor     BIGINT NOT NULL DEFAULT 0 CHECK (cost_price_minor >= 0),
  selling_price_minor  BIGINT NOT NULL CHECK (selling_price_minor >= 0),
  stock_qty            NUMERIC(14,3) NOT NULL DEFAULT 0, -- cached; = SUM(inventory_movements.quantity_delta)
  low_stock_threshold  NUMERIC(14,3) NOT NULL DEFAULT 0,
  active               BOOLEAN NOT NULL DEFAULT TRUE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_products_shop_name ON products(shop_id, lower(name));
CREATE UNIQUE INDEX IF NOT EXISTS uq_products_shop_barcode
  ON products(shop_id, barcode) WHERE barcode IS NOT NULL;

-- --- Sales (append-only; status may flip to 'reversed', amounts never change) --

CREATE TABLE IF NOT EXISTS sales (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  shop_id         UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  receipt_number  TEXT NOT NULL,
  customer_id     UUID REFERENCES customers(id) ON DELETE SET NULL,
  payment_method  TEXT NOT NULL CHECK (payment_method IN ('cash','credit','digital')),
  status          TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed','reversed')),
  subtotal_minor  BIGINT NOT NULL CHECK (subtotal_minor >= 0),
  discount_minor  BIGINT NOT NULL DEFAULT 0 CHECK (discount_minor >= 0),
  total_minor     BIGINT NOT NULL CHECK (total_minor >= 0),
  amount_only     BOOLEAN NOT NULL DEFAULT FALSE,
  note            TEXT,
  reversed_at     TIMESTAMPTZ,
  reversed_by     UUID REFERENCES users(id),
  created_by      UUID NOT NULL REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sales_shop_created ON sales(shop_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_customer ON sales(customer_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_shop_receipt ON sales(shop_id, receipt_number);

CREATE TABLE IF NOT EXISTS sale_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id          UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id       UUID REFERENCES products(id) ON DELETE SET NULL,
  name             TEXT NOT NULL,
  quantity         NUMERIC(14,3) NOT NULL CHECK (quantity > 0),
  unit_price_minor BIGINT NOT NULL CHECK (unit_price_minor >= 0),
  line_total_minor BIGINT NOT NULL CHECK (line_total_minor >= 0)
);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_product ON sale_items(product_id);

-- --- Khata (append-only ledger; customers.balance_minor is the cached balance) --

CREATE TABLE IF NOT EXISTS khata_transactions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  shop_id            UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  customer_id        UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  type               TEXT NOT NULL CHECK (type IN ('credit','payment','adjustment','reversal')),
  amount_minor       BIGINT NOT NULL, -- signed: + increases what customer owes, - reduces it
  balance_after_minor BIGINT NOT NULL,
  method             TEXT CHECK (method IN ('cash','digital')),
  sale_id            UUID REFERENCES sales(id) ON DELETE SET NULL,
  note               TEXT,
  created_by         UUID NOT NULL REFERENCES users(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_khata_customer_created ON khata_transactions(customer_id, created_at);
CREATE INDEX IF NOT EXISTS idx_khata_shop_created ON khata_transactions(shop_id, created_at);

-- --- Inventory (append-only movements; products.stock_qty is the cached balance) --

CREATE TABLE IF NOT EXISTS inventory_movements (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  shop_id        UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  product_id     UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  type           TEXT NOT NULL CHECK (type IN (
                   'opening','sale','sale_reversal','purchase','adjustment','damage','return')),
  quantity_delta NUMERIC(14,3) NOT NULL, -- signed
  balance_after  NUMERIC(14,3) NOT NULL,
  reason         TEXT,
  note           TEXT,
  sale_id        UUID REFERENCES sales(id) ON DELETE SET NULL,
  purchase_id    UUID,
  created_by     UUID NOT NULL REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_inv_product_created ON inventory_movements(product_id, created_at);
CREATE INDEX IF NOT EXISTS idx_inv_shop_created ON inventory_movements(shop_id, created_at);

-- --- Suppliers & purchases ---------------------------------------------------

CREATE TABLE IF NOT EXISTS suppliers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  shop_id     UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  phone       TEXT,
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_suppliers_shop ON suppliers(shop_id, lower(name));

CREATE TABLE IF NOT EXISTS purchases (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  shop_id      UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  supplier_id  UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  total_minor  BIGINT NOT NULL DEFAULT 0 CHECK (total_minor >= 0),
  note         TEXT,
  created_by   UUID NOT NULL REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_purchases_shop_created ON purchases(shop_id, created_at DESC);

CREATE TABLE IF NOT EXISTS purchase_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id      UUID NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id       UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity         NUMERIC(14,3) NOT NULL CHECK (quantity > 0),
  unit_cost_minor  BIGINT NOT NULL CHECK (unit_cost_minor >= 0),
  line_total_minor BIGINT NOT NULL CHECK (line_total_minor >= 0)
);
CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase ON purchase_items(purchase_id);

-- --- Expenses ----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS expenses (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  shop_id      UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  category     TEXT NOT NULL,
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  note         TEXT,
  created_by   UUID NOT NULL REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_expenses_shop_created ON expenses(shop_id, created_at DESC);

-- --- Daily closing -----------------------------------------------------------

CREATE TABLE IF NOT EXISTS daily_closings (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  shop_id               UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  business_date         DATE NOT NULL,
  cash_sales_minor      BIGINT NOT NULL DEFAULT 0,
  digital_sales_minor   BIGINT NOT NULL DEFAULT 0,
  credit_sales_minor    BIGINT NOT NULL DEFAULT 0,
  khata_collected_minor BIGINT NOT NULL DEFAULT 0,
  expenses_minor        BIGINT NOT NULL DEFAULT 0,
  expected_cash_minor   BIGINT NOT NULL DEFAULT 0,
  counted_cash_minor    BIGINT NOT NULL DEFAULT 0,
  difference_minor      BIGINT NOT NULL DEFAULT 0,
  note                  TEXT,
  created_by            UUID NOT NULL REFERENCES users(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_closing_shop_date ON daily_closings(shop_id, business_date);

-- --- Audit log (append-only) -------------------------------------------------

CREATE TABLE IF NOT EXISTS audit_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID,
  shop_id       UUID,
  actor_user_id UUID,
  action        TEXT NOT NULL,
  resource_type TEXT,
  resource_id   TEXT,
  request_id    TEXT,
  metadata      JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_tenant_created ON audit_logs(tenant_id, created_at DESC);

-- --- Idempotency keys --------------------------------------------------------

CREATE TABLE IF NOT EXISTS idempotency_keys (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL,
  user_id         UUID NOT NULL,
  idem_key        TEXT NOT NULL,
  request_hash    TEXT NOT NULL,
  response_status INT,
  response_body   JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_idem_tenant_key ON idempotency_keys(tenant_id, idem_key);

-- --- Notifications -----------------------------------------------------------

CREATE TABLE IF NOT EXISTS notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  shop_id     UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,
  title       TEXT NOT NULL,
  body        TEXT,
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_shop_created ON notifications(shop_id, created_at DESC);
