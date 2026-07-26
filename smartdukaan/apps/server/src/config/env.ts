import { config as loadDotenv } from 'dotenv';
import path from 'node:path';
import { z } from 'zod';

/**
 * Loads and validates environment variables ONCE at process start.
 * The server refuses to boot if a required variable is missing, and secret
 * values are never logged. Access secrets only through this module.
 */

// Load .env from the repo root (two levels up from apps/server) and cwd.
loadDotenv({ path: path.resolve(process.cwd(), '.env') });
loadDotenv({ path: path.resolve(process.cwd(), '../../.env') });

const isTest = process.env.NODE_ENV === 'test';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  TEST_DATABASE_URL: z.string().optional(),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL: z.string().default('30d'),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  // Report WHICH variables are wrong, never their values.
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('\n');
  // eslint-disable-next-line no-console
  console.error(
    `\n[config] Invalid or missing environment variables:\n${issues}\n` +
      `See .env.example for the required variables.\n`,
  );
  process.exit(1);
}

const raw = parsed.data;

// In the test environment, use TEST_DATABASE_URL when present so tests never
// touch the development database.
const databaseUrl =
  isTest && raw.TEST_DATABASE_URL ? raw.TEST_DATABASE_URL : raw.DATABASE_URL;

export const env = {
  nodeEnv: raw.NODE_ENV,
  isProduction: raw.NODE_ENV === 'production',
  isTest,
  port: raw.PORT,
  databaseUrl,
  jwtSecret: raw.JWT_SECRET,
  accessTokenTtl: raw.ACCESS_TOKEN_TTL,
  refreshTokenTtl: raw.REFRESH_TOKEN_TTL,
  corsOrigins: raw.CORS_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean),
} as const;

/** A redacted snapshot safe to log or expose via a health check. */
export function safeConfigSummary() {
  return {
    nodeEnv: env.nodeEnv,
    port: env.port,
    databaseConfigured: env.databaseUrl.length > 0,
    jwtConfigured: env.jwtSecret.length > 0,
    corsOrigins: env.corsOrigins,
  };
}
