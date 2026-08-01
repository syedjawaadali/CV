import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { normalizeText, normalizeBarcode } from '@smartdukaan/shared';
import { api, registerOwner, resetDb, type Session } from './helpers.js';
import { pool, closePool } from '../db/pool.js';

afterAll(async () => { await closePool(); });

async function createProduct(s: Session, body: Record<string, unknown>) {
  const res = await api(s.token).post('/api/products').send({ sellingPrice: 100, ...body });
  if (res.status !== 201) throw new Error(`createProduct ${res.status} ${JSON.stringify(res.body)}`);
  return res.body as { id: string };
}

/** Seed a verified shared variant with a global barcode + base size. */
async function seedShared(name: string, barcode: string, baseQ: number, baseU: string) {
  const src = await pool.query(
    `INSERT INTO catalog_sources (source_type, source_name, trust_level)
     VALUES ('manual_admin', $1, 'platform_reviewed')
     ON CONFLICT (source_type, lower(source_name)) DO UPDATE SET updated_at=now() RETURNING id`, [`t-${name}`]);
  const g = await pool.query(
    `INSERT INTO global_products (canonical_name, canonical_name_normalized, brand, category, source_id, verification_status)
     VALUES ($1,$2,'TestBrand','Grocery',$3,'verified') RETURNING id`, [name, normalizeText(name), src.rows[0].id]);
  const v = await pool.query(
    `INSERT INTO product_variants (global_product_id, variant_name, variant_name_normalized, base_quantity, base_unit, pack_quantity, pack_unit, source_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [g.rows[0].id, name, normalizeText(name), baseQ, baseU, baseQ, baseU, src.rows[0].id]);
  await pool.query(
    `INSERT INTO product_barcodes (barcode_value, barcode_normalized, classification, product_variant_id, ownership_scope, verification_status, source_id)
     VALUES ($1,$2,'standard_valid',$3,'global','verified',$4)`,
    [barcode, normalizeBarcode(barcode), v.rows[0].id, src.rows[0].id]);
  return { variantId: v.rows[0].id, globalId: g.rows[0].id };
}

describe('Recognition — barcode + OCR flows', () => {
  beforeEach(async () => { await resetDb(); });

  it('Flow A: existing retailer product by barcode => exact, select existing', async () => {
    const owner = await registerOwner();
    const prod = await createProduct(owner, { name: 'Local Rice', barcode: '0012345678905' });
    const res = await api(owner.token).post('/api/kb/recognize').send({ barcode: '0012345678905' });
    expect(res.status).toBe(201);
    expect(res.body.confidence).toBe('exact');
    expect(res.body.recommendedAction).toBe('select_existing_product');
    expect(res.body.candidates[0].retailerProductId).toBe(prod.id);
    expect(res.body.observationId).toBeTruthy();
  });

  it('Flow C: no barcode, OCR name+size matches a retailer product', async () => {
    const owner = await registerOwner();
    await createProduct(owner, { name: 'Surf Excel', barcode: null });
    const res = await api(owner.token).post('/api/kb/recognize')
      .send({ ocrText: 'Surf Excel\nDetergent\n1 kg\nMRP Rs 850' });
    expect(res.status).toBe(201);
    expect(res.body.candidates.length).toBeGreaterThanOrEqual(1);
    expect(res.body.candidates[0].displayName).toBe('Surf Excel');
    expect(res.body.extractedAttributes.packSize.baseQuantity).toBe(1000);
    expect(res.body.extractedAttributes.printedPrice.amountMinor).toBe(85000);
  });

  it('shared verified barcode + matching size => exact, add to shop', async () => {
    const owner = await registerOwner();
    await seedShared('Cooking Oil', '5901234123457', 1000, 'ml');
    const res = await api(owner.token).post('/api/kb/recognize')
      .send({ barcode: '5901234123457', ocrText: 'Cooking Oil\n1 L' });
    expect(res.body.confidence).toBe('exact');
    expect(res.body.recommendedAction).toBe('add_shared_product_to_shop');
    expect(res.body.candidates[0].source).toBe('shared');
  });

  it('CRITICAL: barcode matches but OCR pack size contradicts => conflict, not auto-select', async () => {
    const owner = await registerOwner();
    await seedShared('Big Pack', '4006381333931', 1000, 'g'); // catalog says 1kg
    const res = await api(owner.token).post('/api/kb/recognize')
      .send({ barcode: '4006381333931', ocrText: 'Big Pack\n500 g' }); // package says 500g
    expect(res.body.confidence).toBe('conflict');
    expect(res.body.recommendedAction).toBe('resolve_conflict');
    expect(res.body.packagingChange.classification).toBe('possible_different_variant');
  });

  it('detects a printed-price change WITHOUT changing the selling price', async () => {
    const owner = await registerOwner();
    const prod = await createProduct(owner, { name: 'Milk', barcode: '0012345678905', sellingPrice: 120 });
    await api(owner.token).post('/api/kb/price-observations')
      .send({ productId: prod.id, priceType: 'printed_mrp', amount: 130 });
    const res = await api(owner.token).post('/api/kb/recognize')
      .send({ barcode: '0012345678905', ocrText: 'Milk\nMRP Rs 150' });
    expect(res.body.priceChange).not.toBeNull();
    expect(res.body.priceChange.observedPrintedMinor).toBe(15000);
    expect(res.body.priceChange.previousPrintedMinor).toBe(13000);
    expect(res.body.priceChange.differs).toBe(true);
    const after = await api(owner.token).get(`/api/products/${prod.id}`);
    expect(after.body.sellingPriceMinor).toBe(12000); // selling price unchanged
  });

  it('persists observation + candidates and supports confirmation', async () => {
    const owner = await registerOwner();
    const prod = await createProduct(owner, { name: 'Tea', barcode: '0012345678905' });
    const res = await api(owner.token).post('/api/kb/recognize').send({ barcode: '0012345678905' });
    const obsId = res.body.observationId;
    const cand = await pool.query(`SELECT count(*)::int n FROM recognition_candidates WHERE observation_id=$1`, [obsId]);
    expect(cand.rows[0].n).toBeGreaterThanOrEqual(1);
    const confirm = await api(owner.token).post(`/api/kb/observations/${obsId}/confirm`)
      .send({ action: 'confirmed_suggested', retailerProductId: prod.id });
    expect(confirm.status).toBe(201);
    const scans = await api(owner.token).get('/api/kb/recent-scans');
    expect(scans.body.data.length).toBeGreaterThanOrEqual(1);
    expect(scans.body.data[0].confidence).toBe('exact');
  });

  it('not found => low confidence, manual/create', async () => {
    const owner = await registerOwner();
    const res = await api(owner.token).post('/api/kb/recognize').send({ ocrText: 'Totally Unknown Brand XYZ' });
    expect(res.body.confidence).toBe('low');
    expect(res.body.recommendedAction).toBe('manual_or_create');
    expect(res.body.candidates.length).toBe(0);
  });
});

describe('Recognition — tenant isolation', () => {
  beforeEach(async () => { await resetDb(); });

  it('does not surface another shop\'s products as candidates', async () => {
    const a = await registerOwner('Shop A');
    const b = await registerOwner('Shop B');
    await createProduct(b, { name: 'Secret B Product', barcode: '0012345678905' });
    const res = await api(a.token).post('/api/kb/recognize').send({ barcode: '0012345678905' });
    // A must not see B's product; barcode is unknown to A -> not_found-like
    expect(res.body.candidates.every((c: { retailerProductId: string | null }) => c.retailerProductId === null)).toBe(true);
    expect(res.body.confidence).not.toBe('exact');
  });
});
