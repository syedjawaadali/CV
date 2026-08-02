/**
 * Cloud-processing consent (Phase 4). Per-shop (optionally per-user) preference
 * controlling whether a cropped product image may be sent to the approved cloud
 * AI provider. Default is 'ask' — cloud is never used silently.
 */
import { query } from '../../db/pool.js';

export type CloudMode = 'always' | 'ask' | 'never';

export interface ConsentPreference {
  cloudMode: CloudMode;
  wifiOnly: boolean;
  saveConfirmedImage: boolean;
}

const DEFAULT: ConsentPreference = { cloudMode: 'ask', wifiOnly: false, saveConfirmedImage: false };

export async function getConsent(ctx: { shopId: string; userId: string }): Promise<ConsentPreference> {
  const res = await query<{ cloud_mode: CloudMode; wifi_only: boolean; save_confirmed_image: boolean }>(
    `SELECT cloud_mode, wifi_only, save_confirmed_image
       FROM cloud_consent_preferences
      WHERE shop_id = $1 AND (user_id = $2 OR user_id IS NULL)
      ORDER BY user_id NULLS LAST LIMIT 1`,
    [ctx.shopId, ctx.userId],
  );
  const row = res.rows[0];
  if (!row) return DEFAULT;
  return { cloudMode: row.cloud_mode, wifiOnly: row.wifi_only, saveConfirmedImage: row.save_confirmed_image };
}

export async function setConsent(
  ctx: { tenantId: string; shopId: string; userId: string }, pref: Partial<ConsentPreference>,
): Promise<ConsentPreference> {
  const current = await getConsent(ctx);
  const next = { ...current, ...pref };
  await query(
    `INSERT INTO cloud_consent_preferences (tenant_id, shop_id, user_id, cloud_mode, wifi_only, save_confirmed_image, updated_by)
     VALUES ($1,$2,$3,$4,$5,$6,$3)
     ON CONFLICT (shop_id, COALESCE(user_id,'00000000-0000-0000-0000-000000000000'))
     DO UPDATE SET cloud_mode=EXCLUDED.cloud_mode, wifi_only=EXCLUDED.wifi_only,
                   save_confirmed_image=EXCLUDED.save_confirmed_image, updated_by=EXCLUDED.updated_by, updated_at=now()`,
    [ctx.tenantId, ctx.shopId, ctx.userId, next.cloudMode, next.wifiOnly, next.saveConfirmedImage],
  );
  return next;
}
