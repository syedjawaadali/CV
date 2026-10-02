/**
 * Alert/summary preferences (Phase 6) — per-shop (optionally per-user). Controls
 * spoken-alert mode, privacy mode, quiet hours and daily summary. Defaults are
 * conservative: spoken alerts only when the app is open, privacy off, no daily
 * summary until opted in.
 */
import { query } from '../../db/pool.js';
import { writeAudit } from '../../lib/audit.js';

interface Ctx { tenantId: string; shopId: string; userId: string }

export interface AlertPreference {
  preset: 'essential_only' | 'recommended' | 'all_helpful' | 'custom';
  spokenMode: 'never' | 'when_open' | 'while_active' | 'summary_time' | 'critical_only';
  privacyMode: boolean;
  quietHoursStart: number | null;
  quietHoursEnd: number | null;
  dailySummary: boolean;
  language: string | null;
}

const DEFAULT: AlertPreference = {
  preset: 'recommended', spokenMode: 'when_open', privacyMode: false,
  quietHoursStart: null, quietHoursEnd: null, dailySummary: false, language: null,
};

export async function getConsentPref(ctx: { shopId: string; userId: string }): Promise<AlertPreference> {
  const { rows } = await query<{
    preset: AlertPreference['preset']; spoken_mode: AlertPreference['spokenMode']; privacy_mode: boolean;
    quiet_hours_start: number | null; quiet_hours_end: number | null; daily_summary: boolean; language: string | null;
  }>(
    `SELECT preset, spoken_mode, privacy_mode, quiet_hours_start, quiet_hours_end, daily_summary, language
       FROM alert_preferences WHERE shop_id=$1 AND (user_id=$2 OR user_id IS NULL)
      ORDER BY user_id NULLS LAST LIMIT 1`,
    [ctx.shopId, ctx.userId],
  );
  const r = rows[0];
  if (!r) return DEFAULT;
  return {
    preset: r.preset, spokenMode: r.spoken_mode, privacyMode: r.privacy_mode,
    quietHoursStart: r.quiet_hours_start, quietHoursEnd: r.quiet_hours_end,
    dailySummary: r.daily_summary, language: r.language,
  };
}

export async function setConsentPref(ctx: Ctx, patch: Partial<AlertPreference>): Promise<AlertPreference> {
  const current = await getConsentPref(ctx);
  const next = { ...current, ...patch };
  await query(
    `INSERT INTO alert_preferences
       (tenant_id, shop_id, user_id, preset, spoken_mode, privacy_mode, quiet_hours_start, quiet_hours_end, daily_summary, language)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (shop_id, COALESCE(user_id,'00000000-0000-0000-0000-000000000000'))
     DO UPDATE SET preset=EXCLUDED.preset, spoken_mode=EXCLUDED.spoken_mode, privacy_mode=EXCLUDED.privacy_mode,
                   quiet_hours_start=EXCLUDED.quiet_hours_start, quiet_hours_end=EXCLUDED.quiet_hours_end,
                   daily_summary=EXCLUDED.daily_summary, language=EXCLUDED.language, updated_at=now()`,
    [ctx.tenantId, ctx.shopId, ctx.userId, next.preset, next.spokenMode, next.privacyMode,
      next.quietHoursStart, next.quietHoursEnd, next.dailySummary, next.language],
  );
  await writeAudit({
    tenantId: ctx.tenantId, shopId: ctx.shopId, actorUserId: ctx.userId,
    action: 'alert.preferences.update', resourceType: 'alert_preferences',
    metadata: { spokenMode: next.spokenMode, privacyMode: next.privacyMode },
  });
  return next;
}

/** Whether spoken output is allowed right now given prefs + quiet hours + severity. */
export function spokenAllowed(pref: AlertPreference, localHour: number, severity: 'critical' | 'urgent' | 'important' | 'helpful', appOpen: boolean): boolean {
  if (pref.spokenMode === 'never') return false;
  if (pref.spokenMode === 'critical_only' && severity !== 'critical') return false;
  if (pref.spokenMode === 'when_open' && !appOpen) return false;
  // Quiet hours suppress non-critical spoken output.
  if (pref.quietHoursStart != null && pref.quietHoursEnd != null) {
    const inQuiet = inQuietHours(localHour, pref.quietHoursStart, pref.quietHoursEnd);
    if (inQuiet && severity !== 'critical') return false;
  }
  return true;
}

function inQuietHours(hour: number, start: number, end: number): boolean {
  if (start === end) return false;
  return start < end ? (hour >= start && hour < end) : (hour >= start || hour < end);
}
