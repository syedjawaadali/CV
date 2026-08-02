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
  // Phase 4 — Cloud AI (all OPTIONAL and backend-only; never sent to clients or
  // logged with their values). Provider defaults to the deterministic mock so
  // no real spend can occur unless a real key + provider are configured.
  AI_PROVIDER: z.enum(['mock', 'gemini']).default('mock'),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default('gemini-2.0-flash'),
  AI_DAILY_REQUEST_LIMIT: z.coerce.number().int().nonnegative().default(200),
  AI_DAILY_COST_LIMIT_MINOR: z.coerce.number().int().nonnegative().default(50_000), // PKR 500.00/day default ceiling
  // Web-search barcode resolver (backend-only). Provider + key gate the online
  // discovery path; without a key it is skipped and the app falls back to Open
  // Food Facts + manual entry. 'brave' = Brave Search API, 'serpapi' = SerpApi.
  WEB_SEARCH_PROVIDER: z.enum(['none', 'brave', 'serper', 'serpapi', 'google']).default('none'),
  WEB_SEARCH_API_KEY: z.string().optional(),
  WEB_SEARCH_CX: z.string().optional(), // Google Programmable Search engine id (cx)
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
  ai: {
    provider: raw.AI_PROVIDER,
    geminiApiKey: raw.GEMINI_API_KEY ?? '',
    geminiModel: raw.GEMINI_MODEL,
    dailyRequestLimit: raw.AI_DAILY_REQUEST_LIMIT,
    dailyCostLimitMinor: raw.AI_DAILY_COST_LIMIT_MINOR,
  },
  webSearch: {
    provider: raw.WEB_SEARCH_PROVIDER,
    apiKey: raw.WEB_SEARCH_API_KEY ?? '',
    cx: raw.WEB_SEARCH_CX ?? '',
  },
} as const;

/** A redacted snapshot safe to log or expose via a health check. */
export function safeConfigSummary() {
  return {
    nodeEnv: env.nodeEnv,
    port: env.port,
    databaseConfigured: env.databaseUrl.length > 0,
    jwtConfigured: env.jwtSecret.length > 0,
    corsOrigins: env.corsOrigins,
    aiProvider: env.ai.provider,
    aiCredentialConfigured: env.ai.geminiApiKey.length > 0, // boolean only — never the key
  };
}
