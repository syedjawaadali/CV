-- =============================================================================
-- Smart Dukaan — Differentiation features (migration 0002)
--
-- Adds:
--  * global_catalog     — crowd-sourced barcode → product map, SHARED across all
--                         shops. The first retailer who names a barcode fills it
--                         in for everyone; later scans auto-fill instantly.
--  * products.image_url — product photo (visual picker / recognition aid).
--  * distributors       — FMCG distributor directory (global reference data) for
--                         one-tap restock of low-stock items.
--  * sponsored_items    — the paid FMCG "smart suggestion" slot (revenue rail).
--
-- distributors / sponsored_items / a few catalog rows are seeded here (idempotent
-- ON CONFLICT DO NOTHING) so the feature works on a fresh deploy without a reseed.
-- =============================================================================

-- --- Crowd-sourced barcode catalog (cross-tenant, shared knowledge) ----------

CREATE TABLE IF NOT EXISTS global_catalog (
  barcode       TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  name_ur       TEXT,
  category      TEXT,
  default_unit  TEXT NOT NULL DEFAULT 'piece',
  image_url     TEXT,
  contributions INTEGER NOT NULL DEFAULT 1,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- --- Product photo -----------------------------------------------------------

ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url TEXT;

-- --- FMCG distributor directory (global reference data) ----------------------

CREATE TABLE IF NOT EXISTS distributors (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug       TEXT UNIQUE NOT NULL,
  name       TEXT NOT NULL,
  name_ur    TEXT,
  category   TEXT,
  phone      TEXT,
  whatsapp   TEXT,
  city       TEXT,
  sponsored  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_distributors_category ON distributors(lower(category));

-- --- Sponsored FMCG suggestions (the paid slot) ------------------------------

CREATE TABLE IF NOT EXISTS sponsored_items (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug       TEXT UNIQUE NOT NULL,
  brand      TEXT NOT NULL,
  name       TEXT NOT NULL,
  name_ur    TEXT,
  category   TEXT,
  message    TEXT,
  message_ur TEXT,
  image_url  TEXT,
  active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sponsored_active_category ON sponsored_items(active, lower(category));

-- --- Seed reference data (idempotent) ----------------------------------------

INSERT INTO distributors (slug, name, name_ur, category, phone, whatsapp, city, sponsored) VALUES
  ('engro-foods',   'Engro Foods Distributor',   'اینگرو فوڈز ڈسٹری بیوٹر', 'Dairy',      '+923001112233', '+923001112233', 'Karachi',    TRUE),
  ('tapal-tea',     'Tapal Tea Wholesaler',       'ٹپال چائے ہول سیلر',      'Beverages',  '+923002223344', '+923002223344', 'Karachi',    FALSE),
  ('national-foods','National Foods Distributor', 'نیشنل فوڈز ڈسٹری بیوٹر',   'Grocery',    '+923003334455', '+923003334455', 'Lahore',     FALSE),
  ('unilever-fmcg', 'Unilever FMCG Distributor',  'یونی لیور ڈسٹری بیوٹر',    'Household',  '+923004445566', '+923004445566', 'Karachi',    TRUE),
  ('coca-cola',     'Coca-Cola Distributor',      'کوکا کولا ڈسٹری بیوٹر',    'Beverages',  '+923005556677', '+923005556677', 'Islamabad',  FALSE),
  ('kiryana-wh',    'Local Kiryana Wholesale',    'مقامی کریانہ ہول سیل',     'Grocery',    '+923006667788', '+923006667788', 'Faisalabad', FALSE)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO sponsored_items (slug, brand, name, name_ur, category, message, message_ur, active) VALUES
  ('olpers-1l',    'Olpers',     'Olpers Milk 1L',      'اولپرز دودھ ۱ لیٹر', 'Dairy',     'High margin, fast selling — keep it stocked', 'زیادہ منافع، تیز فروخت — ہمیشہ رکھیں',      TRUE),
  ('tapal-danedar','Tapal',      'Tapal Danedar 900g',  'ٹپال دانے دار',       'Beverages', 'Most requested tea by customers',             'گاہکوں کی سب سے زیادہ مانگ والی چائے',      TRUE),
  ('surf-excel',   'Surf Excel', 'Surf Excel 1kg',      'سرف ایکسل',          'Household', 'Top household staple — add to your shelf',    'گھریلو ضرورت — اپنی دکان میں رکھیں',        TRUE)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO global_catalog (barcode, name, name_ur, category, default_unit) VALUES
  ('8964000000017', 'Olpers Milk 1L',     'اولپرز دودھ ۱ لیٹر', 'Dairy',     'packet'),
  ('8964000001234', 'Tapal Danedar 190g', 'ٹپال دانے دار',       'Beverages', 'packet'),
  ('8964000005678', 'National Salt 800g', 'نیشنل نمک',           'Grocery',   'packet'),
  ('8964000009012', 'Sooper Biscuit',     'سوپر بسکٹ',           'Snacks',    'packet')
ON CONFLICT (barcode) DO NOTHING;
