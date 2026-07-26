import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { app, api, resetDb, registerOwner } from './helpers.js';
import { closePool } from '../db/pool.js';

describe('auth + tenant isolation', () => {
  beforeEach(async () => { await resetDb(); });
  afterAll(async () => { await closePool(); });

  it('registers an owner and returns a usable session', async () => {
    const owner = await registerOwner('Kiryana');
    expect(owner.user.role).toBe('owner');
    const me = await api(owner.token).get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe(owner.user.email);
  });

  it('rejects a wrong password with 401', async () => {
    const owner = await registerOwner();
    const res = await request(app).post('/api/auth/login')
      .send({ email: owner.user.email, password: 'wrong-password' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('AUTHENTICATION_ERROR');
  });

  it('blocks unauthenticated access to protected routes', async () => {
    const res = await request(app).get('/api/customers');
    expect(res.status).toBe(401);
  });

  it('prevents cross-tenant access to another shop\'s data', async () => {
    const a = await registerOwner('Shop A');
    const b = await registerOwner('Shop B');

    const created = await api(a.token).post('/api/customers').send({ name: 'A-Customer' });
    expect(created.status).toBe(201);
    const customerId = created.body.id;

    // B must not be able to read A's customer...
    const read = await api(b.token).get(`/api/customers/${customerId}`);
    expect(read.status).toBe(404);

    // ...and B's list must not contain A's customer.
    const list = await api(b.token).get('/api/customers');
    expect(list.body.data.find((c: { id: string }) => c.id === customerId)).toBeUndefined();
  });

  it('does not leak secrets or stack traces in error responses', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'nobody@test.pk', password: 'x' });
    const text = JSON.stringify(res.body);
    expect(text).not.toMatch(/password_hash|jwt|secret|postgres:\/\//i);
  });
});
