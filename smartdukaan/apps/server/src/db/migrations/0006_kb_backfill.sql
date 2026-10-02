-- =============================================================================
-- Smart Dukaan — Knowledge Base conservative backfill (migration 0006)
--
-- CREATES rows only. Never edits or deletes existing products / sales /
-- inventory / prices. Does NOT auto-match products across retailers — every
-- existing product stays catalog_match_status='unmatched' (the 0005 default).
--
-- What it seeds, idempotently (guarded by NOT EXISTS so a re-run is a no-op):
--   1. A catalog source describing this migration.
--   2. A retailer barcode mapping for each existing product that has a barcode
--      (original value preserved verbatim → leading zeros kept).
--   3. An initial retailer selling-price observation = the CURRENT selling price
--      (exact paisa), so price history starts without changing the live price.
--   4. An initial purchase-cost observation where a cost exists.
-- =============================================================================

INSERT INTO catalog_sources (source_type, source_name, trust_level)
VALUES ('existing_product_migration', 'Existing product migration', 'retailer_local')
ON CONFLICT (source_type, lower(source_name)) DO NOTHING;

-- 2) Retailer barcode mappings (verbatim value + whitespace-stripped normalized).
INSERT INTO product_barcodes (
  barcode_value, barcode_normalized, classification, retailer_product_id,
  tenant_id, shop_id, ownership_scope, verification_status, source_id, observation_count)
SELECT
  p.barcode,
  regexp_replace(p.barcode, '\s', '', 'g'),
  'unknown_format', -- runtime analyzeBarcode() is the authority; migration stays neutral
  p.id, p.tenant_id, p.shop_id, 'retailer', 'retailer_local',
  (SELECT id FROM catalog_sources WHERE source_type = 'existing_product_migration' LIMIT 1),
  1
FROM products p
WHERE p.barcode IS NOT NULL AND length(btrim(p.barcode)) > 0
  AND NOT EXISTS (
    SELECT 1 FROM product_barcodes b
     WHERE b.retailer_product_id = p.id
       AND b.ownership_scope = 'retailer'
       AND b.barcode_normalized = regexp_replace(p.barcode, '\s', '', 'g'));

-- 3) Retailer selling-price observation = current price (exact, unchanged).
INSERT INTO price_observations (
  retailer_product_id, tenant_id, shop_id, price_type, amount_minor, currency,
  observation_source, observed_at, is_current, source_id)
SELECT
  p.id, p.tenant_id, p.shop_id, 'retailer_selling', p.selling_price_minor, 'PKR',
  'existing_product_migration', p.created_at, TRUE,
  (SELECT id FROM catalog_sources WHERE source_type = 'existing_product_migration' LIMIT 1)
FROM products p
WHERE NOT EXISTS (
  SELECT 1 FROM price_observations o
   WHERE o.retailer_product_id = p.id
     AND o.price_type = 'retailer_selling'
     AND o.observation_source = 'existing_product_migration');

-- 4) Purchase-cost observation where a cost is recorded.
INSERT INTO price_observations (
  retailer_product_id, tenant_id, shop_id, price_type, amount_minor, currency,
  observation_source, observed_at, is_current, source_id)
SELECT
  p.id, p.tenant_id, p.shop_id, 'purchase_cost', p.cost_price_minor, 'PKR',
  'existing_product_migration', p.created_at, TRUE,
  (SELECT id FROM catalog_sources WHERE source_type = 'existing_product_migration' LIMIT 1)
FROM products p
WHERE p.cost_price_minor > 0
  AND NOT EXISTS (
    SELECT 1 FROM price_observations o
     WHERE o.retailer_product_id = p.id
       AND o.price_type = 'purchase_cost'
       AND o.observation_source = 'existing_product_migration');

-- Log backfill counts (visible in deploy logs; no personal data).
DO $$
DECLARE bc INT; ps INT; pc INT;
BEGIN
  SELECT count(*) INTO bc FROM product_barcodes WHERE ownership_scope='retailer';
  SELECT count(*) INTO ps FROM price_observations WHERE price_type='retailer_selling' AND observation_source='existing_product_migration';
  SELECT count(*) INTO pc FROM price_observations WHERE price_type='purchase_cost' AND observation_source='existing_product_migration';
  RAISE NOTICE 'KB backfill: retailer_barcodes=%, selling_observations=%, cost_observations=%', bc, ps, pc;
END $$;
