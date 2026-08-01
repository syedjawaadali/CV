import request from 'supertest';
import { createApp } from '../app.js';
import { pool } from '../db/pool.js';

export const app = createApp();

const TABLES = [
  // Knowledge Base (Phase 2) — truncated first; most cascade from products anyway.
  'catalog_review_candidates', 'recognition_confirmations', 'recognition_candidates',
  'recognition_observations', 'price_observations', 'product_images', 'product_aliases',
  'product_barcodes', 'packaging_versions', 'product_variants', 'global_products',
  'catalog_sources', 'product_merges',
  // Ordering (Phase earlier)
  'order_items', 'orders', 'customer_accounts',
  // Core
  'idempotency_keys', 'audit_logs', 'notifications', 'daily_closings', 'expenses',
  'purchase_items', 'purchases', 'suppliers', 'inventory_movements',
  'khata_transactions', 'sale_items', 'sales', 'products', 'customers',
  'shop_counters', 'refresh_tokens', 'users', 'shops', 'tenants',
];

export async function resetDb(): Promise<void> {
  await pool.query(`TRUNCATE ${TABLES.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`);
}

export interface Session { token: string; user: Record<string, unknown> }

let counter = 0;
export async function registerOwner(shopName = 'Test Shop'): Promise<Session> {
  counter += 1;
  const email = `owner${counter}_${Date.now()}@test.pk`;
  const res = await request(app).post('/api/auth/register').send({
    name: 'Owner', email, password: 'password123', shopName,
  });
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { token: res.body.accessToken, user: res.body.user };
}

/** Add an employee to the owner's shop and return a logged-in session for them. */
export async function addEmployee(owner: Session, role: string): Promise<Session> {
  counter += 1;
  const email = `emp${counter}_${Date.now()}@test.pk`;
  const created = await request(app)
    .post('/api/employees')
    .set('Authorization', `Bearer ${owner.token}`)
    .send({ name: 'Emp', email, password: 'password123', role });
  if (created.status !== 201) throw new Error(`addEmployee failed: ${created.status} ${JSON.stringify(created.body)}`);
  const login = await request(app).post('/api/auth/login').send({ email, password: 'password123' });
  return { token: login.body.accessToken, user: login.body.user };
}

export const api = (token: string) => ({
  get: (p: string) => request(app).get(p).set('Authorization', `Bearer ${token}`),
  post: (p: string) => request(app).post(p).set('Authorization', `Bearer ${token}`),
  patch: (p: string) => request(app).patch(p).set('Authorization', `Bearer ${token}`),
});
