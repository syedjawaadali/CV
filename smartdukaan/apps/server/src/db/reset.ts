import { pool, closePool } from './pool.js';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';

/**
 * DEVELOPMENT ONLY: truncates all business data (keeping the schema) so you can
 * start from a clean state, then you can run `npm run seed`. Refuses to run in
 * production to protect real data.
 */

const TABLES = [
  'idempotency_keys', 'audit_logs', 'notifications', 'daily_closings', 'expenses',
  'purchase_items', 'purchases', 'suppliers', 'inventory_movements',
  'khata_transactions', 'sale_items', 'sales', 'products', 'customers',
  'shop_counters', 'refresh_tokens', 'users', 'shops', 'tenants',
];

async function reset(): Promise<void> {
  if (env.isProduction) {
    logger.error('db:reset is disabled in production');
    process.exit(1);
  }
  logger.warn('Truncating all data', { database: 'configured' });
  await pool.query(`TRUNCATE ${TABLES.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`);
  logger.info('Reset complete — database is empty. Run `npm run seed` to add demo data.');
}

reset()
  .then(() => closePool())
  .then(() => process.exit(0))
  .catch(async (err) => {
    logger.error('Reset failed', { error: err instanceof Error ? err.message : String(err) });
    await closePool().catch(() => undefined);
    process.exit(1);
  });
