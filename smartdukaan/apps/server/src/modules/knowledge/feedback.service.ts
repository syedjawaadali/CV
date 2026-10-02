/**
 * Recognition feedback & self-learning signals (Phase 7). Records per-shop
 * confirmed/rejected product feedback and exposes it as ranking signals for the
 * recognition scorer. Tenant-scoped: one shop's feedback never affects another.
 * It never changes inventory/price/catalog — only local ranking evidence.
 */
import { learningVerdict, type LearningSignal, type LearningVerdict } from '@smartdukaan/shared';
import { query } from '../../db/pool.js';
import { writeAudit } from '../../lib/audit.js';

interface Ctx { tenantId: string; shopId: string; userId: string }

export async function recordFeedback(
  ctx: Ctx, productId: string, type: 'confirmed' | 'rejected', input?: string | null,
): Promise<void> {
  const owns = await query(`SELECT 1 FROM products WHERE id=$1 AND shop_id=$2`, [productId, ctx.shopId]);
  if (owns.rowCount === 0) return; // silently ignore cross-shop / unknown product
  await query(
    `INSERT INTO recognition_feedback (tenant_id, shop_id, product_id, feedback_type, count, last_input)
     VALUES ($1,$2,$3,$4,1,$5)
     ON CONFLICT (shop_id, product_id, feedback_type)
     DO UPDATE SET count = recognition_feedback.count + 1, last_input = EXCLUDED.last_input, updated_at = now()`,
    [ctx.tenantId, ctx.shopId, productId, type, input ?? null],
  );
  await writeAudit({
    tenantId: ctx.tenantId, shopId: ctx.shopId, actorUserId: ctx.userId,
    action: `recognition.feedback.${type}`, resourceType: 'product', resourceId: productId,
  });
}

/** Learning verdicts for a set of products in this shop (confirmed − rejected). */
export async function learningSignalsFor(
  shopId: string, productIds: string[],
): Promise<Map<string, LearningVerdict>> {
  const map = new Map<string, LearningVerdict>();
  if (productIds.length === 0) return map;
  const { rows } = await query<{ product_id: string; feedback_type: string; count: number }>(
    `SELECT product_id, feedback_type, count FROM recognition_feedback
      WHERE shop_id=$1 AND product_id = ANY($2)`,
    [shopId, productIds],
  );
  const agg = new Map<string, { confirmed: number; rejected: number }>();
  for (const r of rows) {
    const a = agg.get(r.product_id) ?? { confirmed: 0, rejected: 0 };
    if (r.feedback_type === 'confirmed') a.confirmed += Number(r.count);
    else a.rejected += Number(r.count);
    agg.set(r.product_id, a);
  }
  for (const [pid, a] of agg) {
    const sig: LearningSignal = { productId: pid, confirmed: a.confirmed, rejected: a.rejected };
    map.set(pid, learningVerdict(sig));
  }
  return map;
}

/** Retailer-visible list of learned feedback (transparency). */
export async function listFeedback(ctx: { shopId: string }) {
  const { rows } = await query(
    `SELECT f.product_id AS "productId", p.name AS "productName", f.feedback_type AS "type",
            f.count, f.updated_at AS "updatedAt"
       FROM recognition_feedback f JOIN products p ON p.id = f.product_id
      WHERE f.shop_id=$1 ORDER BY f.updated_at DESC LIMIT 200`,
    [ctx.shopId],
  );
  return rows;
}

/** Delete a single feedback signal (correction) or reset all for the shop. */
export async function deleteFeedback(ctx: Ctx, productId: string | null): Promise<number> {
  const res = productId
    ? await query(`DELETE FROM recognition_feedback WHERE shop_id=$1 AND product_id=$2`, [ctx.shopId, productId])
    : await query(`DELETE FROM recognition_feedback WHERE shop_id=$1`, [ctx.shopId]);
  await writeAudit({
    tenantId: ctx.tenantId, shopId: ctx.shopId, actorUserId: ctx.userId,
    action: productId ? 'recognition.feedback.delete' : 'recognition.feedback.reset',
    resourceType: 'recognition_feedback', resourceId: productId,
  });
  return res.rowCount ?? 0;
}
