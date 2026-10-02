import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { api, registerOwner, resetDb, type Session } from './helpers.js';
import { closePool } from '../db/pool.js';

afterAll(async () => { await closePool(); });

async function createProduct(s: Session, body: Record<string, unknown>) {
  const res = await api(s.token).post('/api/products').send({ sellingPrice: 100, unit: 'packet', ...body });
  if (res.status !== 201) throw new Error(`createProduct ${res.status} ${JSON.stringify(res.body)}`);
  return res.body as { id: string };
}

describe('Phase 7 — self-learning ranking', () => {
  beforeEach(async () => { await resetDb(); });

  it('confirmed feedback boosts a product; the boost never changes stock or price', async () => {
    const owner = await registerOwner();
    // Two products with the same brand so name-matching alone is ambiguous.
    const a = await createProduct(owner, { name: 'Tapal Danedar', sellingPrice: 100 });
    const b = await createProduct(owner, { name: 'Tapal Danedar Family', sellingPrice: 200 });

    // Record repeated confirmations for product A on the spoken/typed form "tapal".
    for (let i = 0; i < 2; i++) {
      const fb = await api(owner.token).post('/api/kb/feedback').send({ productId: a.id, type: 'confirmed', input: 'tapal' });
      expect(fb.status).toBe(201);
    }

    const res = await api(owner.token).post('/api/kb/recognize').send({ ocrText: 'Tapal Danedar' });
    expect(res.status).toBe(201);
    // Product A should now rank ahead of B thanks to local confirmations.
    expect(res.body.candidates[0].retailerProductId).toBe(a.id);

    // Stock/price untouched.
    const pa = await api(owner.token).get(`/api/products/${a.id}`);
    expect(Number(pa.body.sellingPriceMinor)).toBe(10000);
  });

  it('negative feedback lowers a candidate but never fabricates a conflict', async () => {
    const owner = await registerOwner();
    const p = await createProduct(owner, { name: 'Lux Soap', barcode: '0012345678905' });
    await api(owner.token).post('/api/kb/feedback').send({ productId: p.id, type: 'rejected' });
    // A barcode-exact match with a rejection is still a confident (non-conflict) match.
    const res = await api(owner.token).post('/api/kb/recognize').send({ barcode: '0012345678905' });
    expect(res.body.confidence).not.toBe('conflict');
    expect(res.body.candidates[0].retailerProductId).toBe(p.id);
  });

  it('feedback is listable and can be corrected/reset', async () => {
    const owner = await registerOwner();
    const p = await createProduct(owner, { name: 'Rice' });
    await api(owner.token).post('/api/kb/feedback').send({ productId: p.id, type: 'confirmed' });
    const list = await api(owner.token).get('/api/kb/feedback');
    expect(list.body.data.length).toBe(1);
    const del = await api(owner.token).post('/api/kb/feedback/delete').send({ productId: p.id });
    expect(del.body.removed).toBeGreaterThanOrEqual(1);
    const after = await api(owner.token).get('/api/kb/feedback');
    expect(after.body.data.length).toBe(0);
  });
});

describe('Phase 7 — tenant isolation & privacy', () => {
  beforeEach(async () => { await resetDb(); });

  it('one shop\'s learned feedback never affects another shop', async () => {
    const a = await registerOwner('Shop A');
    const b = await registerOwner('Shop B');
    const pb = await createProduct(b, { name: 'Secret', barcode: '5901234123457' });
    // B records confirmations; A must not see or be influenced by them.
    await api(b.token).post('/api/kb/feedback').send({ productId: pb.id, type: 'confirmed' });
    const aList = await api(a.token).get('/api/kb/feedback');
    expect(aList.body.data.length).toBe(0);
    // Recording feedback against another shop's product is silently ignored (no leak).
    const cross = await api(a.token).post('/api/kb/feedback').send({ productId: pb.id, type: 'confirmed' });
    expect(cross.status).toBe(201);
    const aList2 = await api(a.token).get('/api/kb/feedback');
    expect(aList2.body.data.length).toBe(0);
  });

  it('resetting personalization requires product:manage', async () => {
    const owner = await registerOwner();
    const { addEmployee } = await import('./helpers.js');
    const cashier = await addEmployee(owner, 'cashier');
    const p = await createProduct(owner, { name: 'Tea' });
    await api(owner.token).post('/api/kb/feedback').send({ productId: p.id, type: 'confirmed' });
    const res = await api(cashier.token).post('/api/kb/feedback/delete').send({ productId: p.id });
    expect(res.status).toBe(403);
  });
});
