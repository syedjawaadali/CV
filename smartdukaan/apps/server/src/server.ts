import { createApp } from './app.js';
import { env, safeConfigSummary } from './config/env.js';
import { checkDatabaseHealth, closePool } from './db/pool.js';
import { logger } from './lib/logger.js';

async function main(): Promise<void> {
  const dbOk = await checkDatabaseHealth();
  if (!dbOk) {
    logger.error('Database is not reachable at startup. Check DATABASE_URL.');
    // Fail fast in production; in development keep running so the error is visible.
    if (env.isProduction) process.exit(1);
  }

  const app = createApp();
  const server = app.listen(env.port, () => {
    logger.info('Smart Dukaan API listening', safeConfigSummary());
  });

  const shutdown = (signal: string) => {
    logger.info('Shutting down', { signal });
    server.close(() => {
      closePool().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error('Fatal startup error', {
    error: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
});
