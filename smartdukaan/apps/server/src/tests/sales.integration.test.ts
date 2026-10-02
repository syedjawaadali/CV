import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { api, resetDb, registerOwner, addEmployee } from './helpers.js';
import { pool, closePool } from '../db/pool.js';

async function makeProduct(token: string, over: Record<string, unknown> = {}) {
  const res = await api(token).post('/api/products').send({
    name: 'Milk', sellingPrice: 100, costPrice: 60, openingStock: 10, lowStockThreshold: 3, unit: 'packet', ...over,
  });
  expect(res.status).toBe(201);
  return res.body;
}

describe('sales, khata and inventory integrity', () => {
  beforeEach(async () => { await resetDb(); });
  afterAll(async () => { await closePool(); });

  it('records a cash sale, computes totals server-side and deducts stock', async () => {
    const owner = await registerOwner();
    const product = await makeProduct(owner.token);
    const sale = await api(owner.token).post('/api/sales').send({
      paymentMethod: 'cash',
      items: [{ productId: product.id, quantity: 2, unitPrice: 100 }],
    });
    expect(sale.status).toBe(201);
    expect(sale.body.totalMinor).toBe(20000);
    const after = await api(owner.token).get(`/api/products/${product.id}`);
    expect(after.body.stockQty).toBe('8.000');
  });

  it('posts a credit sale to khata and keeps the balance reconstructable from the ledger', async () => {
    const owner = await registerOwner();
    const product = await makeProduct(owner.token);
    const customer = await api(owner.token).post('/api/customers').send({ name: 'Imran' });
    const cid = customer.body.id;

    await api(owner.token).post('/api/sales').send({
      paymentMethod: 'credit', customerId: cid,
      items: [{ productId: product.id, quantity: 3, unitPrice: 100 }],
    });
    await api(owner.token).post('/api/khata/payment').send({ customerId: cid, amount: 100, method: 'cash' });

    const cust = await api(owner.token).get(`/api/customers/${cid}`);
    expect(cust.body.balanceMinor).toBe(20000); // 30000 credit - 10000 payment

    // The cached balance must equal the sum of the append-only ledger.
    const sum = await pool.query('SELECT COALESCE(SUM(amount_minor),0)::bigint AS s FROM khata_transactions WHERE customer_id=$1', [cid]);
    expect(Number(sum.rows[0].s)).toBe(20000);
  });

  it('keeps stock reconstructable from inventory movements', async () => {
    const owner = await registerOwner();
    const product = await makeProduct(owner.token);
    await api(owner.token).post('/api/sales').send({ paymentMethod: 'cash', items: [{ productId: product.id, quantity: 4, unitPrice: 100 }] });
    await api(owner.token).post('/api/inventory/adjust').send({ productId: product.id, quantityDelta: 2, reason: 'count_correction' });

    const prod = await api(owner.token).get(`/api/products/${product.id}`);
    expect(prod.body.stockQty).toBe('8.000'); // 10 - 4 + 2

    const sum = await pool.query('SELECT COALESCE(SUM(quantity_delta),0) AS s FROM inventory_movements WHERE product_id=$1', [product.id]);
    expect(Number(sum.rows[0].s)).toBe(8);
  });

  it('prevents duplicate sales via idempotency key', async () => {
    const owner = await registerOwner();
    const product = await makeProduct(owner.token);
    const key = randomUUID();
    const body = { paymentMethod: 'cash', items: [{ productId: product.id, quantity: 1, unitPrice: 100 }] };

    const first = await api(owner.token).post('/api/sales').set('Idempotency-Key', key).send(body);
    const second = await api(owner.token).post('/api/sales').set('Idempotency-Key', key).send(body);

    expect(first.body.receiptNumber).toBe(second.body.receiptNumber);
    const prod = await api(owner.token).get(`/api/products/${product.id}`);
    expect(prod.body.stockQty).toBe('9.000'); // deducted only once
  });

  it('blocks overselling with a business-rule error', async () => {
    const owner = await registerOwner();
    const product = await makeProduct(owner.token);
    const res = await api(owner.token).post('/api/sales').send({
      paymentMethod: 'cash', items: [{ productId: product.id, quantity: 999, unitPrice: 100 }],
    });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('BUSINESS_RULE');
  });

  it('reverses a sale, restoring stock and khata', async () => {
    const owner = await registerOwner();
    const product = await makeProduct(owner.token);
    const customer = await api(owner.token).post('/api/customers').send({ name: 'Ayesha' });
    const sale = await api(owner.token).post('/api/sales').send({
      paymentMethod: 'credit', customerId: customer.body.id,
      items: [{ productId: product.id, quantity: 2, unitPrice: 100 }],
    });
    const rev = await api(owner.token).post(`/api/sales/${sale.body.id}/reverse`).send({});
    expect(rev.status).toBe(200);
    expect(rev.body.status).toBe('reversed');

    const prod = await api(owner.token).get(`/api/products/${product.id}`);
    expect(prod.body.stockQty).toBe('10.000');
    const cust = await api(owner.token).get(`/api/customers/${customer.body.id}`);
    expect(cust.body.balanceMinor).toBe(0);
  });

  it('enforces role permissions (cashier cannot reverse or manage employees)', async () => {
    const owner = await registerOwner();
    const cashier = await addEmployee(owner, 'cashier');
    const product = await makeProduct(owner.token);
    const sale = await api(owner.token).post('/api/sales').send({
      paymentMethod: 'cash', items: [{ productId: product.id, quantity: 1, unitPrice: 100 }],
    });

    // Cashier CAN create a sale.
    const cashierSale = await api(cashier.token).post('/api/sales').send({
      paymentMethod: 'cash', items: [{ productId: product.id, quantity: 1, unitPrice: 100 }],
    });
    expect(cashierSale.status).toBe(201);

    // Cashier CANNOT reverse or manage employees.
    const reverse = await api(cashier.token).post(`/api/sales/${sale.body.id}/reverse`).send({});
    expect(reverse.status).toBe(403);
    const employees = await api(cashier.token).get('/api/employees');
    expect(employees.status).toBe(403);

    // Cashier's dashboard has profit redacted.
    const dash = await api(cashier.token).get('/api/dashboard/summary');
    expect(dash.status).toBe(200);
    expect(dash.body.estimatedProfitMinor).toBe(0);
  });
});
