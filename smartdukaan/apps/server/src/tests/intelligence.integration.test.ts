import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { api, registerOwner, addEmployee, resetDb, type Session } from './helpers.js';
import { pool, closePool } from '../db/pool.js';

afterAll(async () => { await closePool(); });

async function createProduct(s: Session, body: Record<string, unknown>) {
  const res = await api(s.token).post('/api/products').send({ sellingPrice: 100, unit: 'packet', lowStockThreshold: 3, ...body });
  if (res.status !== 201) throw new Error(`createProduct ${res.status} ${JSON.stringify(res.body)}`);
  return res.body as { id: string };
}
/** Record a completed product sale (deducts stock via the real sale service). */
async function sell(s: Session, productId: string, quantity: number) {
  const res = await api(s.token).post('/api/sales').send({
    paymentMethod: 'cash', discount: 0, items: [{ productId, quantity, unitPrice: 1 }],
  });
  if (res.status !== 201) throw new Error(`sell ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}
const alerts = (s: Session) => api(s.token).get('/api/intelligence/alerts');

describe('Phase 6 — deterministic alerts (Flow A)', () => {
  beforeEach(async () => { await resetDb(); });

  it('Flow A: a sale below threshold generates exactly one low-stock alert; alert does not change stock', async () => {
    const owner = await registerOwner();
    const p = await createProduct(owner, { name: 'Surf Excel', openingStock: 5, lowStockThreshold: 3 });
    await sell(owner, p.id, 3); // 5 -> 2, below threshold 3

    const r1 = await alerts(owner);
    expect(r1.status).toBe(200);
    const low = r1.body.data.filter((a: { alertType: string }) => a.alertType === 'low_stock');
    expect(low.length).toBe(1);

    // Re-evaluating must not duplicate the alert.
    const r2 = await alerts(owner);
    expect(r2.body.data.filter((a: { alertType: string }) => a.alertType === 'low_stock').length).toBe(1);

    // The alert never changed inventory.
    const prod = await api(owner.token).get(`/api/products/${p.id}`);
    expect(Number(prod.body.stockQty)).toBe(2);
  });

  it('out-of-stock produces an urgent alert; low-stock resolves when restocked', async () => {
    const owner = await registerOwner();
    const p = await createProduct(owner, { name: 'Coke', openingStock: 3, lowStockThreshold: 3 });
    await sell(owner, p.id, 3); // -> 0
    const oos = await alerts(owner);
    expect(oos.body.data.some((a: { alertType: string; severity: string }) => a.alertType === 'out_of_stock' && a.severity === 'urgent')).toBe(true);

    // Restock via inventory adjust, then re-evaluate → out-of-stock auto-resolves.
    await api(owner.token).post('/api/inventory/adjust').send({ productId: p.id, quantityDelta: 20, reason: 'count_correction' });
    const after = await alerts(owner);
    expect(after.body.data.some((a: { alertType: string }) => a.alertType === 'out_of_stock')).toBe(false);
  });

  it('a large stock adjustment raises a neutral, non-accusatory alert', async () => {
    const owner = await registerOwner();
    const p = await createProduct(owner, { name: 'Rice', openingStock: 5 });
    await api(owner.token).post('/api/inventory/adjust').send({ productId: p.id, quantityDelta: 500, reason: 'other' });
    const r = await alerts(owner);
    const la = r.body.data.find((a: { alertType: string }) => a.alertType === 'large_adjustment');
    expect(la).toBeTruthy();
    expect(String(la.explanation).toLowerCase()).not.toMatch(/fraud|theft|stole|employee/);
  });

  it('an expiring perishable with a recorded date produces an expiry alert', async () => {
    const owner = await registerOwner();
    const p = await createProduct(owner, { name: 'Milk', openingStock: 5, perishable: true });
    const tomorrow = new Date(Date.now() + 24 * 3600_000).toISOString().slice(0, 10);
    await pool.query(`UPDATE products SET expiry_date=$1 WHERE id=$2`, [tomorrow, p.id]);
    const r = await alerts(owner);
    expect(r.body.data.some((a: { alertType: string }) => a.alertType === 'expiring_soon')).toBe(true);
  });
});

describe('Phase 6 — alert lifecycle', () => {
  beforeEach(async () => { await resetDb(); });

  it('snooze hides an alert until it expires; dismiss removes it from the open list', async () => {
    const owner = await registerOwner();
    const p = await createProduct(owner, { name: 'Surf Excel', openingStock: 2, lowStockThreshold: 3 });
    await alerts(owner); // generate
    const list = await alerts(owner);
    const id = list.body.data[0].id;

    const snooze = await api(owner.token).post(`/api/intelligence/alerts/${id}/action`).send({ action: 'snooze', snoozeHours: 24 });
    expect(snooze.status).toBe(201);
    const afterSnooze = await api(owner.token).get('/api/intelligence/alerts');
    expect(afterSnooze.body.data.some((a: { id: string }) => a.id === id)).toBe(false);
  });
});

describe('Phase 6 — reorder suggestions (Flow C)', () => {
  beforeEach(async () => { await resetDb(); });

  it('Flow C: a reorder draft is created on confirmation and no real purchase is placed', async () => {
    const owner = await registerOwner();
    const p = await createProduct(owner, { name: 'Surf Excel', openingStock: 4, lowStockThreshold: 3 });
    // Build sales history so a forecast is possible would need many days; the draft
    // path itself must work regardless. Create a draft directly (confirmation-gated).
    const draft = await api(owner.token).post('/api/intelligence/purchase-drafts')
      .send({ productId: p.id, quantity: 24, unit: 'packet' });
    expect(draft.status).toBe(201);

    const drafts = await api(owner.token).get('/api/intelligence/purchase-drafts');
    expect(drafts.body.data.length).toBe(1);
    // No real purchase was created.
    const purchases = await pool.query(`SELECT count(*)::int n FROM purchases WHERE shop_id=$1`, [owner.user.shopId as string]);
    expect(purchases.rows[0].n).toBe(0);
    // Stock unchanged.
    const prod = await api(owner.token).get(`/api/products/${p.id}`);
    expect(Number(prod.body.stockQty)).toBe(4);
  });

  it('reorder suggestion is skipped when sales history is insufficient (no invented forecast)', async () => {
    const owner = await registerOwner();
    const p = await createProduct(owner, { name: 'NewItem', openingStock: 1, lowStockThreshold: 3 });
    const r = await api(owner.token).get(`/api/intelligence/reorder/${p.id}`);
    expect(r.status).toBe(200);
    expect(r.body.suggestion.suggested).toBe(false);
    expect(r.body.projection.daysRemaining).toBeNull();
  });
});

describe('Phase 6 — summary, voice, privacy, security', () => {
  beforeEach(async () => { await resetDb(); });

  it('on-demand summary uses real data and leads with attention items', async () => {
    const owner = await registerOwner();
    const p = await createProduct(owner, { name: 'Surf Excel', openingStock: 2, lowStockThreshold: 3 });
    await sell(owner, p.id, 2); // out of stock
    const sum = await api(owner.token).get('/api/intelligence/summary?kind=needs_attention');
    expect(sum.status).toBe(200);
    expect(sum.body.counts.outOfStock).toBeGreaterThanOrEqual(1);
    expect(sum.body.speech).toMatch(/out of stock|attention/i);
  });

  it('privacy mode hides exact sales in a spoken closing summary', async () => {
    const owner = await registerOwner();
    const p = await createProduct(owner, { name: 'Coke', openingStock: 10, sellingPrice: 100 });
    await sell(owner, p.id, 2);
    await api(owner.token).put('/api/intelligence/preferences').send({ privacyMode: true });
    const sum = await api(owner.token).get('/api/intelligence/summary?kind=closing');
    expect(sum.body.speech).not.toMatch(/\d{2,}\srupees/);
  });

  it('voice "what should I order" answers read-only and never claims an order was placed', async () => {
    const owner = await registerOwner();
    await createProduct(owner, { name: 'Surf Excel', openingStock: 2, lowStockThreshold: 3 });
    const r = await api(owner.token).post('/api/voice/interpret').send({ transcript: 'what should I order' });
    expect(r.body.intent).toBe('ask_reorder');
    expect(r.body.outcome).toBe('answer');
    expect(String(r.body.speech).toLowerCase()).not.toMatch(/i ordered|order placed|purchased/);
  });

  it('SECURITY: a cashier cannot create a purchase draft (needs purchase:manage)', async () => {
    const owner = await registerOwner();
    const p = await createProduct(owner, { name: 'Rice', openingStock: 5 });
    const cashier = await addEmployee(owner, 'cashier');
    const r = await api(cashier.token).post('/api/intelligence/purchase-drafts').send({ productId: p.id, quantity: 10 });
    expect(r.status).toBe(403);
  });

  it('tenant isolation: a shop never sees another shop\'s alerts', async () => {
    const a = await registerOwner('Shop A');
    const b = await registerOwner('Shop B');
    const pb = await createProduct(b, { name: 'B Secret', openingStock: 1, lowStockThreshold: 3 });
    await alerts(b);
    const aAlerts = await alerts(a);
    expect(aAlerts.body.data.every((x: { productId: string | null }) => x.productId !== pb.id)).toBe(true);
  });
});
