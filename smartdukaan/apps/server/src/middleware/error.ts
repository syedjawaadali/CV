import type { NextFunction, Request, Response } from 'express';
import type { ApiErrorBody } from '@smartdukaan/shared';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors.js';
import { toValidationError } from '../lib/http.js';
import { logger } from '../lib/logger.js';

/** 404 handler for unmatched routes. */
export function notFoundHandler(req: Request, res: Response): void {
  const body: ApiErrorBody = {
    error: { code: 'NOT_FOUND', message: 'Route not found', requestId: req.id },
  };
  res.status(404).json(body);
}

/**
 * Central error handler. Maps known error types to safe HTTP responses and
 * never leaks stack traces, SQL, secrets or internal details to clients.
 */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  let appErr: AppError;

  if (err instanceof AppError) {
    appErr = err;
  } else if (err instanceof ZodError) {
    appErr = toValidationError(err);
  } else if (isPgError(err)) {
    appErr = mapPgError(err);
  } else {
    appErr = new AppError('INTERNAL_ERROR', 'Something went wrong. Please try again.');
  }

  if (appErr.status >= 500) {
    logger.error('unhandled error', {
      requestId: req.id,
      code: appErr.code,
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
  }

  const body: ApiErrorBody = {
    error: {
      code: appErr.code,
      message: appErr.expose ? appErr.message : 'Something went wrong. Please try again.',
      ...(appErr.fieldErrors ? { fieldErrors: appErr.fieldErrors } : {}),
      requestId: req.id,
    },
  };
  res.status(appErr.status).json(body);
}

interface PgError {
  code?: string;
  constraint?: string;
  detail?: string;
}

function isPgError(err: unknown): err is PgError {
  return typeof err === 'object' && err !== null && 'code' in err &&
    typeof (err as { code?: unknown }).code === 'string';
}

function mapPgError(err: PgError): AppError {
  switch (err.code) {
    case '23505': // unique_violation
      return new AppError('CONFLICT', 'This record already exists.');
    case '23503': // foreign_key_violation
      return new AppError('VALIDATION_ERROR', 'A referenced record was not found.');
    case '23514': // check_violation
      return new AppError('VALIDATION_ERROR', 'A value is out of the allowed range.');
    case '08000':
    case '08003':
    case '08006': // connection errors
      return new AppError('DATABASE_UNAVAILABLE', 'The service is temporarily unavailable.');
    default:
      return new AppError('INTERNAL_ERROR', 'Something went wrong. Please try again.');
  }
}
