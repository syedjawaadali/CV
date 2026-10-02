import type { PoolClient } from 'pg';
import type { AuthUser, RegisterInput, Role } from '@smartdukaan/shared';
import { ROLES } from '@smartdukaan/shared';
import { withTransaction, query } from '../../db/pool.js';
import { hashPassword, verifyPassword } from '../../lib/password.js';
import {
  generateRefreshToken, hashRefreshToken, signAccessToken, ttlToMs,
} from '../../lib/jwt.js';
import { conflict, unauthorized } from '../../lib/errors.js';
import { env } from '../../config/env.js';

interface UserRow {
  id: string; tenant_id: string; shop_id: string; name: string;
  email: string; role: string; status: string; language: string;
}

interface ShopRow { id: string; name: string; language: string }

function buildAuthUser(user: UserRow, shop: ShopRow): AuthUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role as Role,
    status: user.status as 'active' | 'suspended',
    tenantId: user.tenant_id,
    shopId: user.shop_id,
    shopName: shop.name,
    language: (shop.language as 'en' | 'ur') ?? 'en',
  };
}

function issueAccess(user: UserRow): string {
  return signAccessToken({
    sub: user.id, tid: user.tenant_id, sid: user.shop_id, role: user.role as Role,
  });
}

async function createRefreshToken(
  tx: PoolClient, userId: string, userAgent: string | undefined,
): Promise<string> {
  const { token, hash } = generateRefreshToken();
  const expiresAt = new Date(Date.now() + ttlToMs(env.refreshTokenTtl));
  await tx.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, user_agent, expires_at)
     VALUES ($1,$2,$3,$4)`,
    [userId, hash, userAgent ?? null, expiresAt],
  );
  return token;
}

export interface AuthResult {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
}

export async function registerOwner(
  input: RegisterInput, userAgent?: string,
): Promise<AuthResult> {
  const existing = await query('SELECT 1 FROM users WHERE lower(email) = lower($1)', [input.email]);
  if (existing.rowCount && existing.rowCount > 0) {
    throw conflict('An account with this email already exists.');
  }

  return withTransaction(async (tx) => {
    const tenant = await tx.query<{ id: string }>(
      'INSERT INTO tenants (name) VALUES ($1) RETURNING id',
      [input.shopName],
    );
    const tenantId = tenant.rows[0]!.id;

    const shop = await tx.query<ShopRow>(
      `INSERT INTO shops (tenant_id, name, category, language)
       VALUES ($1,$2,$3,'en') RETURNING id, name, language`,
      [tenantId, input.shopName, input.shopCategory ?? null],
    );
    const shopRow = shop.rows[0]!;

    await tx.query('INSERT INTO shop_counters (shop_id) VALUES ($1)', [shopRow.id]);

    const passwordHash = await hashPassword(input.password);
    const user = await tx.query<UserRow>(
      `INSERT INTO users (tenant_id, shop_id, name, email, password_hash, role, status, language)
       VALUES ($1,$2,$3,$4,$5,$6,'active','en')
       RETURNING id, tenant_id, shop_id, name, email, role, status, language`,
      [tenantId, shopRow.id, input.name, input.email, passwordHash, ROLES.OWNER],
    );
    const userRow = user.rows[0]!;

    const refreshToken = await createRefreshToken(tx, userRow.id, userAgent);
    return {
      user: buildAuthUser(userRow, shopRow),
      accessToken: issueAccess(userRow),
      refreshToken,
    };
  });
}

export async function login(
  email: string, password: string, userAgent?: string,
): Promise<AuthResult> {
  const { rows } = await query<UserRow & { password_hash: string }>(
    `SELECT u.id, u.tenant_id, u.shop_id, u.name, u.email, u.role, u.status,
            u.language, u.password_hash
       FROM users u WHERE lower(u.email) = lower($1)`,
    [email],
  );
  const user = rows[0];
  // Constant-ish behaviour: still run a hash comparison to reduce user enumeration.
  const ok = user ? await verifyPassword(password, user.password_hash) : await verifyPassword(password, '$2a$10$0000000000000000000000000000000000000000000000000000');
  if (!user || !ok) throw unauthorized('Incorrect email or password');
  if (user.status !== 'active') throw unauthorized('Your account has been suspended');

  const shop = await query<ShopRow>('SELECT id, name, language FROM shops WHERE id = $1', [user.shop_id]);

  return withTransaction(async (tx) => {
    const refreshToken = await createRefreshToken(tx, user.id, userAgent);
    return {
      user: buildAuthUser(user, shop.rows[0]!),
      accessToken: issueAccess(user),
      refreshToken,
    };
  });
}

export async function refresh(
  rawToken: string, userAgent?: string,
): Promise<{ user: AuthUser; accessToken: string; refreshToken: string }> {
  const hash = hashRefreshToken(rawToken);
  return withTransaction(async (tx) => {
    const found = await tx.query<{ id: string; user_id: string; expires_at: Date; revoked_at: Date | null }>(
      'SELECT id, user_id, expires_at, revoked_at FROM refresh_tokens WHERE token_hash = $1 FOR UPDATE',
      [hash],
    );
    const row = found.rows[0];
    if (!row || row.revoked_at || row.expires_at.getTime() < Date.now()) {
      throw unauthorized('Your session has expired. Please sign in again.');
    }
    // Rotate: revoke the used token and issue a fresh one.
    await tx.query('UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1', [row.id]);

    const user = await tx.query<UserRow>(
      `SELECT id, tenant_id, shop_id, name, email, role, status, language
         FROM users WHERE id = $1`,
      [row.user_id],
    );
    const userRow = user.rows[0];
    if (!userRow || userRow.status !== 'active') {
      throw unauthorized('Your account is no longer active.');
    }
    const shop = await tx.query<ShopRow>('SELECT id, name, language FROM shops WHERE id = $1', [userRow.shop_id]);
    const newRefresh = await createRefreshToken(tx, userRow.id, userAgent);
    return {
      user: buildAuthUser(userRow, shop.rows[0]!),
      accessToken: issueAccess(userRow),
      refreshToken: newRefresh,
    };
  });
}

export async function logout(rawToken: string | undefined): Promise<void> {
  if (!rawToken) return;
  await query('UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL', [
    hashRefreshToken(rawToken),
  ]);
}

export async function getMe(userId: string): Promise<AuthUser> {
  const { rows } = await query<UserRow>(
    `SELECT id, tenant_id, shop_id, name, email, role, status, language
       FROM users WHERE id = $1`,
    [userId],
  );
  const user = rows[0];
  if (!user) throw unauthorized('Your account was not found');
  const shop = await query<ShopRow>('SELECT id, name, language FROM shops WHERE id = $1', [user.shop_id]);
  return buildAuthUser(user, shop.rows[0]!);
}
