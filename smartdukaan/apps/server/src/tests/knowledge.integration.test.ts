import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { normalizeText, normalizeBarcode } from '@smartdukaan/shared';
import { api, registerOwner, addEmployee, resetDb, type Session } from './helpers.js';
import { pool, closePool } from '../db/pool.js';

afterAll(async () => { await closePool(); });

async function createProduct(s: Session, body: Record<string, unknown>) {
  const res = await api(s.token).post('/api/products').send({ sellingPrice: 100, ...body });
  if (res.status !== 201) throw new Error(`createProduct ${res.status} ${JSON.stringify(res.body)}`);
  return res.body as { id: string; barcode: string | null };
}

/** Seed a SHARED catalog variant directly (simulating an admin/import source). */
async function seedSharedVariant(name: string, barcode?: string): Promise<{ variantId: string; globalId: string }> {
  const src = await pool.query(
    `INSERT INTO catalog_sources (source_type, source_name, trust_level)
     VALUES ('manual_admin', $1, 'platform_reviewed')
     ON CONFLICT (source_type, lower(source_name)) DO UPDATE SET updated_at = now()
     RETURNING id`, [`test-${name}`]);
  const sourceId = src.rows[0].id;
  const g = await pool.query(
    `INSERT INTO global_products (canonical_name, canonical_name_normalized, brand, category, source_id, verification_status)
     VALUES ($1,$2,'TestBrand','Grocery',$3,'verified') RETURNING id`,
    [name, normalizeText(name), sourceId]);
  const globalId = g.rows[0].id;
  const v = await pool.query(
    `INSERT INTO product_variants (global_product_id, variant_name, variant_name_normalized, pack_quantity, pack_unit, source_id)
     VALUES ($1,$2,$3,1,'kg',$4) RETURNING id`,
    [globalId, `${name} 1kg`, normalizeText(`${name} 1kg`), sourceId]);
  const variantId = v.rows[0].id;
  if (barcode) {
    await pool.query(
      `INSERT INTO product_barcodes (barcode_value, barcode_normalized, classification, product_variant_id, ownership_scope, verification_status, source_id)
       VALUES ($1,$2,'standard_valid',$3,'global','verified',$4)`,
      [barcode, normalizeBarcode(barcode), variantId, sourceId]);
  }
  return { variantId, globalId };
}

describe('Knowledge Base — barcode lookup', () => {
  beforeEach(async () => { await resetDb(); });

  it('returns retailer_exact_match for the shop\'s own product and preserves leading zeros', async () => {
    const owner = await registerOwner();
    await createProduct(owner, { name: 'Local Rice', barcode: '0012345678905' });
    const res = await api(owner.token).get('/api/kb/lookup/0012345678905');
    expect(res.status).toBe(200);
    expect(res.body.lookupStatus).toBe('retailer_exact_match');
    expect(res.body.normalizedBarcode).toBe('0012345678905'); // leading zeros intact
    expect(res.body.retailerProduct.name).toBe('Local Rice');
    expect(res.body.observationId).toBeTruthy();
  });

  it('returns not_found for an unknown barcode and records an observation', async () => {
    const owner = await registerOwner();
    const res = await api(owner.token).get('/api/kb/lookup/4006381333931');
    expect(res.body.lookupStatus).toBe('not_found');
    expect(res.body.recommendedNextAction).toBe('create_retailer_product');
    const obs = await pool.query(`SELECT status FROM recognition_observations WHERE id = $1`, [res.body.observationId]);
    expect(obs.rows[0].status).toBe('unmatched');
  });

  it('returns shared_exact_match when only the shared catalog knows the barcode', async () => {
    const owner = await registerOwner();
    await seedSharedVariant('Surf Excel', '5901234123457');
    const res = await api(owner.token).get('/api/kb/lookup/5901234123457');
    expect(res.body.lookupStatus).toBe('shared_exact_match');
    expect(res.body.sharedProduct.name).toBe('Surf Excel');
    expect(res.body.recommendedNextAction).toBe('add_shared_product_to_shop');
  });

  it('returns multiple_candidates when a barcode maps to more than one variant (conflict)', async () => {
    const owner = await registerOwner();
    await seedSharedVariant('Product A', '8991234567890');
    await seedSharedVariant('Product B', '8991234567890');
    const res = await api(owner.token).get('/api/kb/lookup/8991234567890');
    expect(res.body.lookupStatus).toBe('multiple_candidates');
    expect(res.body.conflict).toBe(true);
    expect(res.body.candidates.length).toBe(2);
  });

  it('classifies an in-store weighed barcode as internal_code, not a hard error', async () => {
    const owner = await registerOwner();
    const res = await api(owner.token).get('/api/kb/lookup/2011234500009');
    expect(res.body.lookupStatus).toBe('internal_code');
  });
});

describe('Knowledge Base — link / price / suggest / recent', () => {
  beforeEach(async () => { await resetDb(); });

  it('links a retailer product to a shared variant and can unlink it', async () => {
    const owner = await registerOwner();
    const prod = await createProduct(owner, { name: 'Detergent' });
    const { variantId } = await seedSharedVariant('Surf Excel');
    const link = await api(owner.token).post(`/api/kb/products/${prod.id}/link`).send({ variantId });
    expect(link.status).toBe(200);
    expect(link.body.catalogMatchStatus).toBe('confirmed');
    const conf = await pool.query(`SELECT count(*)::int n FROM recognition_confirmations WHERE confirmed_retailer_product_id = $1`, [prod.id]);
    expect(conf.rows[0].n).toBe(1);
    const unlink = await api(owner.token).post(`/api/kb/products/${prod.id}/unlink`).send({});
    expect(unlink.body.catalogMatchStatus).toBe('unmatched');
  });

  it('records a printed-MRP observation WITHOUT changing the retailer selling price', async () => {
    const owner = await registerOwner();
    const prod = await createProduct(owner, { name: 'Milk', sellingPrice: 120 });
    const before = await api(owner.token).get(`/api/products/${prod.id}`);
    const obs = await api(owner.token).post('/api/kb/price-observations')
      .send({ productId: prod.id, priceType: 'printed_mrp', amount: 150 });
    expect(obs.status).toBe(201);
    const after = await api(owner.token).get(`/api/products/${prod.id}`);
    expect(after.body.sellingPriceMinor).toBe(before.body.sellingPriceMinor); // unchanged
    const hist = await api(owner.token).get(`/api/kb/products/${prod.id}/price-history`);
    // migration backfill is truncated in tests, so only our MRP observation exists here
    expect(hist.body.data.some((o: { priceType: string }) => o.priceType === 'printed_mrp')).toBe(true);
  });

  it('creates a catalog suggestion as a pending review candidate (never auto-published)', async () => {
    const owner = await registerOwner();
    const s = await api(owner.token).post('/api/kb/suggest')
      .send({ candidateType: 'alias', proposedAlias: 'surf', proposedData: { note: 'local name' } });
    expect(s.status).toBe(201);
    expect(s.body.reviewStatus).toBe('pending');
    const review = await api(owner.token).get('/api/kb/review?status=pending');
    expect(review.status).toBe(200);
    expect(review.body.data.length).toBe(1);
  });

  it('searches the shared catalog by name', async () => {
    const owner = await registerOwner();
    await seedSharedVariant('Surf Excel');
    const res = await api(owner.token).get('/api/kb/search?q=surf');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data[0].name).toBe('Surf Excel');
  });

  it('returns recently created products', async () => {
    const owner = await registerOwner();
    await createProduct(owner, { name: 'First' });
    await createProduct(owner, { name: 'Second' });
    const res = await api(owner.token).get('/api/kb/recent?type=created&limit=5');
    expect(res.body.data[0].name).toBe('Second');
  });
});

describe('Knowledge Base — authorization & tenant isolation', () => {
  beforeEach(async () => { await resetDb(); });

  it('a staff member without catalog:review cannot access the review queue', async () => {
    const owner = await registerOwner();
    const cashier = await addEmployee(owner, 'cashier');
    const res = await api(cashier.token).get('/api/kb/review');
    expect(res.status).toBe(403);
    // the owner (platform-admin stand-in) can
    const ok = await api(owner.token).get('/api/kb/review');
    expect(ok.status).toBe(200);
  });

  it('a retailer cannot read another shop\'s price history or link another shop\'s product', async () => {
    const a = await registerOwner('Shop A');
    const b = await registerOwner('Shop B');
    const prodB = await createProduct(b, { name: 'B Product' });
    // A tries to read B's price history -> not found (scoped away)
    const hist = await api(a.token).get(`/api/kb/products/${prodB.id}/price-history`);
    expect(hist.status).toBe(404);
    // A tries to link B's product -> not found
    const { variantId } = await seedSharedVariant('Shared X');
    const link = await api(a.token).post(`/api/kb/products/${prodB.id}/link`).send({ variantId });
    expect(link.status).toBe(404);
    // B's product must remain unmatched
    const still = await api(b.token).get(`/api/products/${prodB.id}`);
    expect(still.body.catalogMatchStatus).toBe('unmatched');
  });
});
