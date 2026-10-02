import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, closePool } from './pool.js';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';

/**
 * Forward-only migration runner. Applies each *.sql file in
 * src/db/migrations exactly once, in filename order, inside its own
 * transaction. Applied migrations are recorded in the `_migrations` table.
 * Re-running is a no-op (idempotent), so it is safe on every deploy.
 */

const migrationsDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'migrations',
);

async function run(): Promise<void> {
  logger.info('Running migrations', {
    nodeEnv: env.nodeEnv,
    databaseConfigured: env.databaseUrl.length > 0,
  });

  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name       TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const { rows } = await pool.query<{ name: string }>('SELECT name FROM _migrations');
  const applied = new Set(rows.map((r) => r.name));

  let count = 0;
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(path.join(migrationsDir, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO _migrations(name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      logger.info('Applied migration', { file });
      count += 1;
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error('Migration failed — rolled back', {
        file,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    } finally {
      client.release();
    }
  }

  logger.info('Migrations complete', { applied: count, total: files.length });
}

run()
  .then(() => closePool())
  .then(() => process.exit(0))
  .catch(async (err) => {
    logger.error('Migration run aborted', {
      error: err instanceof Error ? err.message : String(err),
    });
    await closePool().catch(() => undefined);
    process.exit(1);
  });
