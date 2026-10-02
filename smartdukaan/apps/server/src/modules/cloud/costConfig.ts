/**
 * Cost estimation (Phase 4). Estimated cost is NOT an invoice — it is a
 * versioned estimate in integer minor units (paisa), overridable via the
 * ai_cost_config table. Real spend is provider-billed. Never hardcode provider
 * prices at call sites; import from here.
 */
import { query } from '../../db/pool.js';
import { DEFAULT_COST_BASIS } from './config.js';

export interface CostBasis {
  provider: string; model: string;
  perImageMinor: number; per1kInputMinor: number; per1kOutputMinor: number;
  minChargeMinor: number; currency: string;
}

export async function activeCostBasis(provider: string, model: string): Promise<CostBasis> {
  const res = await query<{
    per_image_minor: string; per_1k_input_minor: string; per_1k_output_minor: string;
    min_charge_minor: string; currency: string;
  }>(
    `SELECT per_image_minor, per_1k_input_minor, per_1k_output_minor, min_charge_minor, currency
       FROM ai_cost_config WHERE provider=$1 AND model=$2 AND is_active
       ORDER BY effective_date DESC NULLS LAST, created_at DESC LIMIT 1`,
    [provider, model],
  );
  const row = res.rows[0];
  if (!row) return { ...DEFAULT_COST_BASIS, provider, model };
  return {
    provider, model,
    perImageMinor: Number(row.per_image_minor),
    per1kInputMinor: Number(row.per_1k_input_minor),
    per1kOutputMinor: Number(row.per_1k_output_minor),
    minChargeMinor: Number(row.min_charge_minor),
    currency: row.currency,
  };
}

/** Max (pre-flight) estimate used for budget reservation. */
export function estimateMaxCostMinor(basis: CostBasis, imageCount: number, inputBytes: number): number {
  const inputK = Math.ceil(inputBytes / 1024);
  const est = basis.perImageMinor * imageCount
    + basis.per1kInputMinor * inputK
    + basis.per1kOutputMinor * 2; // budget for ~2k output tokens-worth
  return Math.max(basis.minChargeMinor, est);
}

/** Post-flight estimate once we know output size. */
export function estimateActualCostMinor(basis: CostBasis, imageCount: number, inputBytes: number, outputBytes: number): number {
  const inputK = Math.ceil(inputBytes / 1024);
  const outputK = Math.ceil(outputBytes / 1024);
  const est = basis.perImageMinor * imageCount
    + basis.per1kInputMinor * inputK
    + basis.per1kOutputMinor * outputK;
  return Math.max(basis.minChargeMinor, est);
}
