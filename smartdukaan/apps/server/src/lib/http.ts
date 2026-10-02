import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError, type ZodTypeAny, type z } from 'zod';
import { badRequest } from './errors.js';

/** Wrap an async route handler so thrown errors reach the error middleware. */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

/** Validate `req.body` against a zod schema; throws a 400 with field errors. */
export function parseBody<S extends ZodTypeAny>(schema: S, req: Request): z.infer<S> {
  return parse(schema, req.body);
}

export function parseQuery<S extends ZodTypeAny>(schema: S, req: Request): z.infer<S> {
  return parse(schema, req.query);
}

function parse<S extends ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  throw toValidationError(result.error);
}

export function toValidationError(err: ZodError) {
  const fieldErrors: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join('.') || '_';
    if (!fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  const first = Object.values(fieldErrors)[0] ?? 'Invalid input';
  return badRequest(first, fieldErrors);
}

export function ok<T>(res: Response, data: T, status = 200): void {
  res.status(status).json(data);
}
