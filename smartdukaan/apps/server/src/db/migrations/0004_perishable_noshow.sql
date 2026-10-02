-- =============================================================================
-- Smart Dukaan — No-show protection for perishables (migration 0004)
--
-- Perishable items (dairy, etc.) can't be re-packed, so a no-show is a real
-- loss. Protections:
--   * products.perishable            — mark items that spoil / can't restock.
--   * orders.has_perishable          — set when any line is perishable.
--   * orders.advance_rate            — 0.50 for perishable orders, else 0.30.
--   * orders.pickup_by               — reservation deadline (short for perishables).
--   * status 'expired'               — overdue orders auto-expire (deposit kept).
--   * customer_accounts.no_show_count — forfeited-deposit expiries bump this.
-- =============================================================================

ALTER TABLE products ADD COLUMN IF NOT EXISTS perishable BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS has_perishable BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS advance_rate NUMERIC(4,3) NOT NULL DEFAULT 0.300;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS pickup_by TIMESTAMPTZ;

ALTER TABLE customer_accounts ADD COLUMN IF NOT EXISTS no_show_count INTEGER NOT NULL DEFAULT 0;

-- Allow the new 'expired' terminal status.
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check
  CHECK (status IN ('pending_payment','confirmed','accepted','ready','fulfilled','rejected','cancelled','expired'));

-- Demo: dairy is perishable (Olpers Milk in the seed).
UPDATE products SET perishable = TRUE WHERE lower(category) = 'dairy';
