/**
 * Inventory snapshot service (Phase 6). Builds the ONE common snapshot every
 * alert/forecast/summary uses, from the append-only inventory_movements + cached
 * products.stock_qty + pending purchase drafts. It reads only — it NEVER writes
 * inventory. Server data is the synced source of truth, so freshness is
 * 'current' unless a conflict is recorded; client offline/conflict handling is
 * layered on the device.
 */
import {
  classifyDataQuality, availableFrom, type InventorySnapshot, type ProductImportance,
} from '@smartdukaan/shared';
import { query } from '../../db/pool.js';

interface Ctx { shopId: string }

interface ProductRow {
  id: string; name: string; unit: string; stock_qty: string; low_stock_threshold: string;
  reorder_qty: string | null; perishable: boolean; expiry_date: string | null;
  importance: string | null; intentionally_unstocked: boolean; active: boolean;
  created_at: string; selling_price_minor: string; cost_price_minor: string;
  last_stock_count_at: string | null; supplier_lead_time_days: number | null;
}

const NEW_PRODUCT_MS = 3 * 24 * 60 * 60 * 1000;

export interface SnapshotBundle {
  snapshot: InventorySnapshot;
  lastAdjustmentDelta: number | null;
  daysSinceStockCount: number | null;
  openingStockRecorded: boolean;
  leadTimeDays: number;
  leadTimeSource: 'verified' | 'partner' | 'estimated' | 'unknown';
  hasPendingOrder: boolean;
}

/** Build snapshots for every active product in the shop (bounded). */
export async function shopSnapshots(ctx: Ctx, now: Date, limit = 500): Promise<SnapshotBundle[]> {
  const { rows } = await query<ProductRow>(
    `SELECT id, name, unit, stock_qty, low_stock_threshold, reorder_qty, perishable, expiry_date,
            importance, intentionally_unstocked, active, created_at, selling_price_minor, cost_price_minor,
            last_stock_count_at, supplier_lead_time_days
       FROM products WHERE shop_id = $1 ORDER BY updated_at DESC LIMIT $2`,
    [ctx.shopId, limit],
  );
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  // Incoming = sum of pending purchase drafts per product.
  const incomingMap = await sumBy(
    `SELECT product_id, COALESCE(sum(quantity),0)::text AS total FROM purchase_drafts
      WHERE shop_id = $1 AND product_id = ANY($2) AND status IN ('draft','submitted') GROUP BY product_id`,
    [ctx.shopId, ids],
  );
  // Last adjustment delta + last sale/purchase timestamps + opening presence.
  const movementMeta = await movementMetaFor(ctx.shopId, ids);

  return rows.map((r) => {
    const onHand = Number(r.stock_qty);
    const available = availableFrom(onHand, 0);
    const meta = movementMeta.get(r.id) ?? { lastAdjustmentDelta: null, lastSaleAt: null, lastPurchaseAt: null, lastMovementAt: null, hasOpening: false, salesDays: 0, nonZeroDays: 0 };
    const incoming = Number(incomingMap.get(r.id) ?? 0);
    const importance = (r.importance ?? 'normal') as ProductImportance;
    const dataQuality = classifyDataQuality({
      onHand, lowStockThreshold: Number(r.low_stock_threshold),
      nonZeroSaleDays: meta.nonZeroDays, historyDays: meta.salesDays,
      hasUnit: !!r.unit, hasSellingPrice: Number(r.selling_price_minor) > 0,
      recentlyCreated: now.getTime() - Date.parse(r.created_at) < NEW_PRODUCT_MS,
    });
    const daysSinceStockCount = r.last_stock_count_at
      ? Math.floor((now.getTime() - Date.parse(r.last_stock_count_at)) / (24 * 60 * 60 * 1000)) : null;

    const snapshot: InventorySnapshot = {
      productId: r.id, name: r.name, unit: r.unit, onHand, reserved: 0, incoming, damaged: 0,
      available, lowStockThreshold: Number(r.low_stock_threshold),
      reorderQty: r.reorder_qty != null ? Number(r.reorder_qty) : null,
      perishable: r.perishable, expiryDate: r.expiry_date, importance,
      intentionallyUnstocked: r.intentionally_unstocked, active: r.active, createdAt: r.created_at,
      lastSaleAt: meta.lastSaleAt, lastPurchaseAt: meta.lastPurchaseAt, lastMovementAt: meta.lastMovementAt,
      lastStockCountAt: r.last_stock_count_at, pendingLocalMovements: 0, hasConflict: false,
      freshness: 'current', dataQuality,
    };

    return {
      snapshot,
      lastAdjustmentDelta: meta.lastAdjustmentDelta,
      daysSinceStockCount,
      openingStockRecorded: meta.hasOpening,
      leadTimeDays: r.supplier_lead_time_days ?? 2,
      leadTimeSource: r.supplier_lead_time_days != null ? 'estimated' : 'unknown',
      hasPendingOrder: incoming > 0,
    };
  });
}

export async function productSnapshot(ctx: Ctx, productId: string, now: Date): Promise<SnapshotBundle | null> {
  const all = await shopSnapshots(ctx, now);
  return all.find((s) => s.snapshot.productId === productId) ?? null;
}

async function sumBy(sql: string, params: unknown[]): Promise<Map<string, string>> {
  const { rows } = await query<{ product_id: string; total: string }>(sql, params);
  return new Map(rows.map((r) => [r.product_id, r.total]));
}

interface MovementMeta {
  lastAdjustmentDelta: number | null; lastSaleAt: string | null; lastPurchaseAt: string | null;
  lastMovementAt: string | null; hasOpening: boolean; salesDays: number; nonZeroDays: number;
}

async function movementMetaFor(shopId: string, productIds: string[]): Promise<Map<string, MovementMeta>> {
  const { rows } = await query<{
    product_id: string; last_adjustment: string | null; last_sale: string | null;
    last_purchase: string | null; last_movement: string | null; has_opening: boolean;
  }>(
    `SELECT product_id,
            (SELECT quantity_delta::text FROM inventory_movements m2
               WHERE m2.product_id = m.product_id AND m2.type='adjustment'
               ORDER BY created_at DESC LIMIT 1) AS last_adjustment,
            max(created_at) FILTER (WHERE type='sale')     AS last_sale,
            max(created_at) FILTER (WHERE type='purchase')  AS last_purchase,
            max(created_at)                                 AS last_movement,
            bool_or(type='opening')                         AS has_opening
       FROM inventory_movements m
      WHERE shop_id = $1 AND product_id = ANY($2)
      GROUP BY product_id`,
    [shopId, productIds],
  );
  // Daily sales history window (last 30 days), per product, for data-quality.
  const hist = await query<{ product_id: string; sales_days: number; nonzero_days: number }>(
    `SELECT si.product_id,
            count(DISTINCT date_trunc('day', s.created_at))::int AS sales_days,
            count(DISTINCT date_trunc('day', s.created_at))::int AS nonzero_days
       FROM sale_items si JOIN sales s ON s.id = si.sale_id
      WHERE s.shop_id = $1 AND si.product_id = ANY($2) AND s.created_at >= now() - interval '30 days'
      GROUP BY si.product_id`,
    [shopId, productIds],
  );
  const histMap = new Map(hist.rows.map((h) => [h.product_id, h]));
  const map = new Map<string, MovementMeta>();
  for (const r of rows) {
    const h = histMap.get(r.product_id);
    map.set(r.product_id, {
      lastAdjustmentDelta: r.last_adjustment != null ? Number(r.last_adjustment) : null,
      lastSaleAt: r.last_sale, lastPurchaseAt: r.last_purchase, lastMovementAt: r.last_movement,
      hasOpening: r.has_opening, salesDays: h?.sales_days ?? 0, nonZeroDays: h?.nonzero_days ?? 0,
    });
  }
  return map;
}
