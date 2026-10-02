/**
 * Minimal structured logger. Emits single-line JSON to stdout/stderr so logs
 * are machine-parseable in production. Redacts known-sensitive keys so secrets,
 * tokens and passwords never reach the logs.
 */

type Level = 'debug' | 'info' | 'warn' | 'error';

const REDACT_KEYS = new Set([
  'password', 'password_hash', 'passwordhash', 'token', 'accesstoken',
  'refreshtoken', 'authorization', 'cookie', 'jwt', 'jwtsecret', 'secret',
  'databaseurl', 'database_url', 'otp',
]);

function redact(value: unknown): unknown {
  if (value == null) return value;
  if (Array.isArray(value)) return value.map(redact);
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = REDACT_KEYS.has(k.toLowerCase()) ? '[redacted]' : redact(v);
    }
    return out;
  }
  return value;
}

function emit(level: Level, message: string, meta?: Record<string, unknown>) {
  // Keep test output clean: only surface warnings/errors during tests.
  if (process.env.NODE_ENV === 'test' && (level === 'debug' || level === 'info')) return;
  const line = {
    ts: new Date().toISOString(),
    level,
    msg: message,
    ...(meta ? (redact(meta) as Record<string, unknown>) : {}),
  };
  const text = JSON.stringify(line);
  if (level === 'error' || level === 'warn') process.stderr.write(text + '\n');
  else process.stdout.write(text + '\n');
}

export const logger = {
  debug: (m: string, meta?: Record<string, unknown>) => emit('debug', m, meta),
  info: (m: string, meta?: Record<string, unknown>) => emit('info', m, meta),
  warn: (m: string, meta?: Record<string, unknown>) => emit('warn', m, meta),
  error: (m: string, meta?: Record<string, unknown>) => emit('error', m, meta),
};
