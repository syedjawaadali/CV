/**
 * Entity resolution (Phase 5) — tenant-scoped. Resolves a spoken product /
 * customer phrase to a concrete record using retailer data + store-specific
 * voice memory (aliases). Returns candidates so the coordinator can clarify
 * when more than one matches; it never guesses when a variant would affect
 * stock or price.
 */
import { normalizeText } from '@smartdukaan/shared';
import { query } from '../../db/pool.js';

interface Ctx { shopId: string }

export interface ProductCandidate {
  id: string; name: string; unit: string; stockQty: number; sellingPriceMinor: number;
}
export interface CustomerCandidate { id: string; name: string; phoneTail: string | null }

/** Resolve a product phrase within the shop: memory alias → exact → prefix → contains. */
export async function resolveProduct(ctx: Ctx, phrase: string): Promise<ProductCandidate[]> {
  const norm = normalizeText(phrase);
  if (!norm) return [];

  // 1) Store-specific voice alias (approved) → direct product id.
  const alias = await query<{ resolved_reference: string }>(
    `SELECT resolved_reference FROM voice_memory
      WHERE shop_id = $1 AND memory_type = 'product_alias' AND active AND user_approved
        AND spoken_form_normalized = $2 AND resolved_reference IS NOT NULL LIMIT 1`,
    [ctx.shopId, norm],
  );
  if (alias.rows[0]?.resolved_reference) {
    const byId = await fetchProducts(ctx, `p.id = $2`, [alias.rows[0].resolved_reference]);
    if (byId.length) return byId;
  }

  // 2) Exact normalized name / local Urdu name.
  const exact = await fetchProducts(ctx, `(lower(p.name) = $2 OR lower(coalesce(p.name_ur,'')) = $2)`, [norm]);
  if (exact.length) return exact;

  // 3) Prefix, then contains (bounded).
  const like = await fetchProducts(ctx, `(lower(p.name) LIKE $2 OR lower(coalesce(p.name_ur,'')) LIKE $2)`, [`%${norm}%`]);
  return like;
}

async function fetchProducts(ctx: Ctx, whereExtra: string, params: unknown[]): Promise<ProductCandidate[]> {
  const { rows } = await query<{
    id: string; name: string; unit: string; stock_qty: string; selling_price_minor: string;
  }>(
    `SELECT p.id, p.name, p.unit, p.stock_qty, p.selling_price_minor
       FROM products p
      WHERE p.shop_id = $1 AND p.active AND ${whereExtra}
      ORDER BY p.updated_at DESC LIMIT 5`,
    [ctx.shopId, ...params],
  );
  return rows.map((r) => ({
    id: r.id, name: r.name, unit: r.unit,
    stockQty: Number(r.stock_qty), sellingPriceMinor: Number(r.selling_price_minor),
  }));
}

/** Resolve a customer phrase within the shop by name (privacy-safe identifiers). */
export async function resolveCustomer(ctx: Ctx, phrase: string): Promise<CustomerCandidate[]> {
  const norm = normalizeText(phrase);
  if (!norm) return [];
  const { rows } = await query<{ id: string; name: string; phone: string | null }>(
    `SELECT id, name, phone FROM customers
      WHERE shop_id = $1 AND lower(name) LIKE $2
      ORDER BY updated_at DESC LIMIT 5`,
    [ctx.shopId, `%${norm}%`],
  );
  return rows.map((r) => ({
    id: r.id, name: r.name,
    phoneTail: r.phone ? r.phone.slice(-4) : null,
  }));
}
