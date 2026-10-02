/**
 * Reorder service (Phase 6). Combines the snapshot, a controlled demand forecast
 * and pending-order awareness into an EXPLAINABLE suggestion, and can create a
 * confirmation-gated purchase DRAFT. It never places a real purchase/order and
 * never changes inventory.
 */
import {
  demandBaseline, projectStockout, suggestReorder, DEFAULT_REORDER,
  type ReorderSuggestion, type StockoutProjection,
} from '@smartdukaan/shared';
import { query } from '../../db/pool.js';
import { writeAudit } from '../../lib/audit.js';
import { notFound, badRequest } from '../../lib/errors.js';
import { productSnapshot } from './snapshot.service.js';
import { dailyDemandSeries } from './history.service.js';

interface Ctx { tenantId: string; shopId: string; userId: string }

export interface ReorderResult {
  productId: string;
  productName: string;
  available: number;
  incoming: number;
  suggestion: ReorderSuggestion;
  projection: StockoutProjection;
  freshness: string;
  dataQuality: string;
}

export async function reorderForProduct(ctx: Ctx, productId: string, now: Date): Promise<ReorderResult> {
  const bundle = await productSnapshot(ctx, productId, now);
  if (!bundle) throw notFound('Product not found');
  const snap = bundle.snapshot;

  const series = await dailyDemandSeries(ctx, productId, now);
  const baseline = demandBaseline(series, 'weighted_average');
  const projection = projectStockout(snap.available, baseline);

  const packSize = snap.reorderQty && snap.reorderQty > 0 ? 1 : 1; // reorderQty is a hint, not a pack; default individual
  const suggestion = suggestReorder(
    {
      available: snap.available, incoming: snap.incoming, leadTimeDays: bundle.leadTimeDays,
      leadTimeSource: bundle.leadTimeSource, baseline, hasPendingOrder: bundle.hasPendingOrder,
    },
    { ...DEFAULT_REORDER, packSize },
  );

  return {
    productId, productName: snap.name, available: snap.available, incoming: snap.incoming,
    suggestion, projection, freshness: snap.freshness, dataQuality: snap.dataQuality,
  };
}

/** Reorder suggestions across the shop, only for products that need attention. */
export async function reorderSuggestions(ctx: Ctx, now: Date, limit = 50): Promise<ReorderResult[]> {
  const { rows } = await query<{ id: string }>(
    `SELECT id FROM products
      WHERE shop_id=$1 AND active AND NOT intentionally_unstocked
        AND stock_qty <= GREATEST(low_stock_threshold, 0)
      ORDER BY stock_qty ASC LIMIT $2`,
    [ctx.shopId, limit],
  );
  const out: ReorderResult[] = [];
  for (const r of rows) {
    const res = await reorderForProduct(ctx, r.id, now);
    if (res.suggestion.suggested) out.push(res);
  }
  return out;
}

/** Create a confirmation-gated purchase DRAFT (never a real purchase/order). */
export async function createPurchaseDraft(
  ctx: Ctx, input: { productId: string; quantity: number; unit?: string | null; supplierId?: string | null },
): Promise<{ id: string }> {
  if (!(input.quantity > 0)) throw badRequest('Quantity must be greater than zero');
  const owns = await query(`SELECT 1 FROM products WHERE id=$1 AND shop_id=$2`, [input.productId, ctx.shopId]);
  if (owns.rowCount === 0) throw notFound('Product not found');

  const res = await query<{ id: string }>(
    `INSERT INTO purchase_drafts (tenant_id, shop_id, product_id, supplier_id, quantity, unit, source, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,'reorder_suggestion',$7) RETURNING id`,
    [ctx.tenantId, ctx.shopId, input.productId, input.supplierId ?? null, input.quantity, input.unit ?? null, ctx.userId],
  );
  await writeAudit({
    tenantId: ctx.tenantId, shopId: ctx.shopId, actorUserId: ctx.userId,
    action: 'reorder.draft.create', resourceType: 'purchase_draft', resourceId: res.rows[0]!.id,
    metadata: { productId: input.productId, quantity: input.quantity },
  });
  return { id: res.rows[0]!.id };
}

export async function listPurchaseDrafts(ctx: { shopId: string }) {
  const { rows } = await query(
    `SELECT d.id, d.product_id AS "productId", p.name AS "productName", d.quantity, d.unit,
            d.status, d.created_at AS "createdAt"
       FROM purchase_drafts d JOIN products p ON p.id = d.product_id
      WHERE d.shop_id = $1 AND d.status IN ('draft','submitted') ORDER BY d.created_at DESC LIMIT 100`,
    [ctx.shopId],
  );
  return rows;
}
