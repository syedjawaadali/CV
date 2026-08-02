import pg from 'pg';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';

/**
 * Single shared PostgreSQL connection pool. All queries go through here.
 * `withTransaction` runs a callback inside a transaction with automatic
 * COMMIT/ROLLBACK — used for every multi-write operation (sales, khata,
 * inventory) to guarantee all-or-nothing consistency.
 */

const { Pool, types } = pg;

// node-postgres returns BIGINT (OID 20) as a string by default. Our money is
// stored as BIGINT paisa and the API/DTO contract exposes it as a JS number.
// Amounts are bounded by validation (<= 100,000,000 rupees = 1e10 paisa per
// transaction), far below Number.MAX_SAFE_INTEGER (~9e15), so parsing int8 as a
// number is safe here. NUMERIC quantities are still read via ::text casts to
// preserve exact decimals.
types.setTypeParser(20, (val: string | null) => (val === null ? null : Number(val)));

// Supabase (and most managed Postgres) require TLS. Local Postgres does not.
const needsSsl = /supabase|amazonaws|render|neon|heroku/i.test(env.databaseUrl);

export const pool = new Pool({
  connectionString: env.databaseUrl,
  max: env.isTest ? 5 : 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
});

pool.on('error', (err) => {
  logger.error('pg pool error', { error: err.message });
});

export type Sql = Pick<pg.PoolClient, 'query'>;

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<pg.QueryResult<T>> {
  return pool.query<T>(text, params as never[]);
}

export async function withTransaction<T>(
  fn: (tx: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore rollback failure */
    }
    throw err;
  } finally {
    client.release();
  }
}

export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

export async function closePool(): Promise<void> {
  await pool.end();
}
