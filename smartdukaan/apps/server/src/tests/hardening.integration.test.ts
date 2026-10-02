import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { app, api, registerOwner, addEmployee, resetDb, type Session } from './helpers.js';
import { closePool } from '../db/pool.js';

afterAll(async () => { await closePool(); });

async function createProduct(s: Session, body: Record<string, unknown>) {
  const res = await api(s.token).post('/api/products').send({ sellingPrice: 100, unit: 'packet', ...body });
  return res.body as { id: string };
}

describe('Phase 8 — health & readiness', () => {
  it('liveness responds ok', async () => {
    const r = await request(app).get('/health');
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('ok');
  });
  it('readiness checks the database and never exposes secret values', async () => {
    const r = await request(app).get('/health/ready');
    expect([200, 503]).toContain(r.status);
    const text = JSON.stringify(r.body);
    expect(text).not.toMatch(/password|jwtSecret|GEMINI|api[_-]?key/i);
    // Only boolean/enum config is exposed.
    expect(r.body.config.databaseConfigured).toBe(true);
  });
});

describe('Phase 8 — broken object-level authorization (BOLA)', () => {
  beforeEach(async () => { await resetDb(); });

  it('a shop cannot read another shop\'s product by id', async () => {
    const a = await registerOwner('Shop Alpha');
    const b = await registerOwner('Shop Beta');
    const pb = await createProduct(b, { name: 'B Product' });
    const r = await api(a.token).get(`/api/products/${pb.id}`);
    expect([403, 404]).toContain(r.status);
  });

  it('a shop cannot adjust another shop\'s inventory', async () => {
    const a = await registerOwner('Shop Alpha');
    const b = await registerOwner('Shop Beta');
    const pb = await createProduct(b, { name: 'B Product', openingStock: 10 });
    const r = await api(a.token).post('/api/inventory/adjust').send({ productId: pb.id, quantityDelta: -5, reason: 'other' });
    expect([403, 404]).toContain(r.status);
    // B's stock is unchanged.
    const pbAfter = await api(b.token).get(`/api/products/${pb.id}`);
    expect(Number(pbAfter.body.stockQty)).toBe(10);
  });
});

describe('Phase 8 — broken function-level authorization (BFLA)', () => {
  beforeEach(async () => { await resetDb(); });

  it('a cashier cannot manage employees', async () => {
    const owner = await registerOwner();
    const cashier = await addEmployee(owner, 'cashier');
    const r = await api(cashier.token).post('/api/employees').send({ name: 'X', email: 'x@t.pk', password: 'password123', role: 'cashier' });
    expect(r.status).toBe(403);
  });

  it('an unauthenticated request to a protected route is 401', async () => {
    const r = await request(app).get('/api/products');
    expect(r.status).toBe(401);
  });

  it('a tampered/garbage bearer token is rejected', async () => {
    const r = await request(app).get('/api/products').set('Authorization', 'Bearer not.a.real.token');
    expect(r.status).toBe(401);
  });
});

describe('Phase 8 — injection & unsafe input are treated as data', () => {
  beforeEach(async () => { await resetDb(); });

  it('SQL-injection-like product name is stored literally, not executed', async () => {
    const owner = await registerOwner();
    const evil = "'; DROP TABLE products; --";
    const p = await createProduct(owner, { name: evil });
    const got = await api(owner.token).get(`/api/products/${p.id}`);
    expect(got.body.name).toBe(evil);
    // The table still exists and is queryable.
    const list = await api(owner.token).get('/api/products');
    expect(Array.isArray(list.body.data ?? list.body)).toBe(true);
  });

  it('an oversized transcript is rejected by validation, not processed', async () => {
    const owner = await registerOwner();
    const huge = 'a'.repeat(5000);
    const r = await api(owner.token).post('/api/voice/interpret').send({ transcript: huge });
    expect(r.status).toBe(400);
  });
});

describe('Phase 8 — error responses do not leak internals', () => {
  beforeEach(async () => { await resetDb(); });
  it('a not-found returns a safe shape without stack traces', async () => {
    const owner = await registerOwner();
    const r = await api(owner.token).get('/api/products/00000000-0000-0000-0000-000000000000');
    expect([404, 403]).toContain(r.status);
    expect(JSON.stringify(r.body)).not.toMatch(/at Object|node_modules|\.ts:\d+/);
  });
});
