import type { NextFunction, Request, Response } from 'express';
import { query } from '../db/pool.js';
import { verifyCustomerToken } from '../lib/jwt.js';
import { unauthorized } from '../lib/errors.js';

/**
 * Authenticates a buyer from their Bearer customer token, then loads the
 * customer account to confirm it still exists. Sets req.customer.
 */
export async function requireCustomer(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) throw unauthorized('You are not signed in');
    const token = header.slice('Bearer '.length).trim();
    const payload = verifyCustomerToken(token);

    const { rows } = await query<{ id: string; name: string; phone: string }>(
      'SELECT id, name, phone FROM customer_accounts WHERE id = $1',
      [payload.sub],
    );
    const customer = rows[0];
    if (!customer) throw unauthorized('Your account was not found');

    req.customer = { id: customer.id, name: customer.name, phone: customer.phone };
    next();
  } catch (err) {
    next(err);
  }
}
