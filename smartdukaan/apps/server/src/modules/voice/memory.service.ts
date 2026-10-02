/**
 * Store-specific voice memory (Phase 5) — tenant-scoped pronunciation/aliases.
 * One confirmation creates a shop-local alias; it NEVER touches the global
 * catalog. Aliases are surfaced back to product resolution.
 */
import { normalizeText } from '@smartdukaan/shared';
import { query } from '../../db/pool.js';
import { writeAudit } from '../../lib/audit.js';

interface Ctx { tenantId: string; shopId: string; userId: string }

export async function rememberProductAlias(
  ctx: Ctx, spokenForm: string, productId: string, approved: boolean, language?: string | null,
): Promise<string> {
  const norm = normalizeText(spokenForm);
  const res = await query<{ id: string }>(
    `INSERT INTO voice_memory
       (tenant_id, shop_id, memory_type, spoken_form, spoken_form_normalized, resolved_reference, language, user_approved)
     VALUES ($1,$2,'product_alias',$3,$4,$5,$6,$7)
     ON CONFLICT (shop_id, memory_type, spoken_form_normalized)
     DO UPDATE SET resolved_reference = EXCLUDED.resolved_reference,
                   confirmation_count = voice_memory.confirmation_count + 1,
                   user_approved = voice_memory.user_approved OR EXCLUDED.user_approved,
                   active = TRUE, updated_at = now()
     RETURNING id`,
    [ctx.tenantId, ctx.shopId, spokenForm, norm, productId, language ?? null, approved],
  );
  await writeAudit({
    tenantId: ctx.tenantId, shopId: ctx.shopId, actorUserId: ctx.userId,
    action: 'voice.memory.save', resourceType: 'voice_memory', resourceId: res.rows[0]!.id,
    metadata: { type: 'product_alias', approved },
  });
  return res.rows[0]!.id;
}

export async function listMemory(ctx: { shopId: string }) {
  const { rows } = await query(
    `SELECT id, memory_type AS "memoryType", spoken_form AS "spokenForm",
            resolved_reference AS "resolvedReference", confirmation_count AS "confirmationCount",
            user_approved AS "userApproved", active, created_at AS "createdAt"
       FROM voice_memory WHERE shop_id = $1 AND active ORDER BY updated_at DESC LIMIT 100`,
    [ctx.shopId],
  );
  return rows;
}

export async function deleteMemory(ctx: Ctx, id: string): Promise<boolean> {
  const res = await query(`UPDATE voice_memory SET active = FALSE, updated_at = now() WHERE id = $1 AND shop_id = $2`, [id, ctx.shopId]);
  if (res.rowCount) {
    await writeAudit({
      tenantId: ctx.tenantId, shopId: ctx.shopId, actorUserId: ctx.userId,
      action: 'voice.memory.delete', resourceType: 'voice_memory', resourceId: id,
    });
  }
  return (res.rowCount ?? 0) > 0;
}
