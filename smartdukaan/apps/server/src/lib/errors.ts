/**
 * Structured application errors. Every error carries a stable machine code, an
 * HTTP status, and a user-safe message. Internal details are never leaked to
 * clients; the central error handler decides what is safe to return.
 */

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'AUTHENTICATION_ERROR'
  | 'AUTHORIZATION_ERROR'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'IDEMPOTENCY_CONFLICT'
  | 'BUSINESS_RULE'
  | 'RATE_LIMIT'
  | 'DATABASE_UNAVAILABLE'
  | 'INTERNAL_ERROR';

const STATUS: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  AUTHENTICATION_ERROR: 401,
  AUTHORIZATION_ERROR: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  IDEMPOTENCY_CONFLICT: 409,
  BUSINESS_RULE: 422,
  RATE_LIMIT: 429,
  DATABASE_UNAVAILABLE: 503,
  INTERNAL_ERROR: 500,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly fieldErrors?: Record<string, string>;
  readonly expose: boolean;

  constructor(
    code: ErrorCode,
    message: string,
    opts: { fieldErrors?: Record<string, string>; expose?: boolean } = {},
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = STATUS[code];
    this.fieldErrors = opts.fieldErrors;
    // 5xx errors are not exposed verbatim; 4xx messages are user-facing.
    this.expose = opts.expose ?? this.status < 500;
  }
}

export const badRequest = (m: string, fieldErrors?: Record<string, string>) =>
  new AppError('VALIDATION_ERROR', m, { fieldErrors });
export const unauthorized = (m = 'You are not signed in') =>
  new AppError('AUTHENTICATION_ERROR', m);
export const forbidden = (m = 'You do not have permission to do this') =>
  new AppError('AUTHORIZATION_ERROR', m);
export const notFound = (m = 'Not found') => new AppError('NOT_FOUND', m);
export const conflict = (m: string) => new AppError('CONFLICT', m);
export const businessRule = (m: string) => new AppError('BUSINESS_RULE', m);
