import { query } from '../../db/pool.js';
import { notFound } from '../../lib/errors.js';
import { decodeCursor, encodeCursor } from '../../lib/pagination.js';

interface Ctx { tenantId: string; shopId: string }

const SELECT = `
  id, name, phone, locality, note,
  balance_minor AS "balanceMinor",
  created_at AS "createdAt"`;

export async function listCustomers(
  ctx: Ctx, opts: { limit: number; cursor?: string; q?: string },
) {
  const cur = decodeCursor(opts.cursor);
  const params: unknown[] = [ctx.shopId];
  let where = 'shop_id = $1';
  if (opts.q) {
    params.push(`%${opts.q}%`);
    where += ` AND (name ILIKE $${params.length} OR phone ILIKE $${params.length})`;
  }
  if (cur) {
    params.push(cur.createdAt, cur.id);
    where += ` AND (created_at, id) < ($${params.length - 1}::timestamptz, $${params.length}::uuid)`;
  }
  params.push(opts.limit + 1);
  const { rows } = await query(
    `SELECT ${SELECT} FROM customers
      WHERE ${where}
      ORDER BY created_at DESC, id DESC
      LIMIT $${params.length}`,
    params,
  );
  const hasMore = rows.length > opts.limit;
  const data = hasMore ? rows.slice(0, opts.limit) : rows;
  const last = data[data.length - 1] as { createdAt: string; id: string } | undefined;
  return {
    data,
    nextCursor: hasMore && last ? encodeCursor(last.createdAt, last.id) : null,
  };
}

export async function getCustomer(ctx: Ctx, id: string) {
  const { rows } = await query(
    `SELECT ${SELECT} FROM customers WHERE id = $1 AND shop_id = $2`,
    [id, ctx.shopId],
  );
  if (!rows[0]) throw notFound('Customer not found');
  return rows[0];
}

export async function createCustomer(
  ctx: Ctx & { tenantId: string },
  input: { name: string; phone?: string | null; locality?: string | null; note?: string | null },
) {
  const { rows } = await query(
    `INSERT INTO customers (tenant_id, shop_id, name, phone, locality, note)
     VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING ${SELECT}`,
    [ctx.tenantId, ctx.shopId, input.name, input.phone ?? null, input.locality ?? null, input.note ?? null],
  );
  return rows[0]!;
}

export async function updateCustomer(
  ctx: Ctx, id: string,
  input: { name?: string; phone?: string | null; locality?: string | null; note?: string | null },
) {
  const { rows } = await query(
    `UPDATE customers SET
       name = COALESCE($1, name),
       phone = COALESCE($2, phone),
       locality = COALESCE($3, locality),
       note = COALESCE($4, note),
       updated_at = now()
     WHERE id = $5 AND shop_id = $6
     RETURNING ${SELECT}`,
    [input.name ?? null, input.phone ?? null, input.locality ?? null, input.note ?? null, id, ctx.shopId],
  );
  if (!rows[0]) throw notFound('Customer not found');
  return rows[0];
}
