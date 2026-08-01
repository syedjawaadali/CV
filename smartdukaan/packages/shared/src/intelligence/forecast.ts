/**
 * Controlled, explainable demand forecasting (Phase 6) — pure, deterministic,
 * versioned. NO generative model. Forecasts are ESTIMATES with confidence and
 * limitations, and are SKIPPED when evidence is insufficient. Stockout time is
 * always phrased as an estimate ("may finish in about N days").
 */
import { FORECAST_MIN } from './snapshot.js';

export const FORECAST_VERSION = '1';

export type BaselineMethod = 'recent_average' | 'weighted_average' | 'median' | 'day_of_week';
export type ForecastConfidence = 'high' | 'medium' | 'low' | 'insufficient_data';

export interface DemandBaseline {
  method: BaselineMethod;
  version: string;
  dailyDemand: number;       // units/day
  inputDays: number;
  nonZeroDays: number;
  confidence: ForecastConfidence;
  limitations: string[];
}

/**
 * `dailySales` is an ordered array of per-day unit totals (oldest → newest),
 * amount-only sales already excluded by the caller.
 */
export function demandBaseline(
  dailySales: number[], method: BaselineMethod = 'weighted_average',
): DemandBaseline {
  const inputDays = dailySales.length;
  const nonZeroDays = dailySales.filter((d) => d > 0).length;
  const limitations: string[] = [];

  if (inputDays < FORECAST_MIN.historyDays) limitations.push('short history');
  if (nonZeroDays < FORECAST_MIN.nonZeroSaleDays) limitations.push('few days with sales');

  let dailyDemand = 0;
  if (inputDays > 0) {
    switch (method) {
      case 'recent_average':
        dailyDemand = mean(dailySales); break;
      case 'median':
        dailyDemand = median(dailySales); break;
      case 'weighted_average':
        dailyDemand = weightedMean(dailySales); break;
      case 'day_of_week':
        dailyDemand = mean(dailySales); break; // caller supplies same-weekday series
    }
  }

  const confidence = confidenceFor(inputDays, nonZeroDays, dailySales);
  return { method, version: FORECAST_VERSION, dailyDemand: round3(dailyDemand), inputDays, nonZeroDays, confidence, limitations };
}

function confidenceFor(inputDays: number, nonZeroDays: number, series: number[]): ForecastConfidence {
  if (inputDays < FORECAST_MIN.historyDays || nonZeroDays < FORECAST_MIN.nonZeroSaleDays) return 'insufficient_data';
  const cv = coefficientOfVariation(series);
  if (nonZeroDays >= 12 && cv < 0.5) return 'high';
  if (cv < 1.0) return 'medium';
  return 'low';
}

export interface StockoutProjection {
  daysRemaining: number | null;    // null when demand ~0 or forecast not eligible
  dailyDemand: number;
  confidence: ForecastConfidence;
  estimate: true;                  // always an estimate, never a fact
  explanation: string;
  limitations: string[];
}

/** Estimate days until an item runs out. Returns null when it cannot be estimated. */
export function projectStockout(available: number, baseline: DemandBaseline): StockoutProjection {
  const eligible = baseline.confidence !== 'insufficient_data';
  if (!eligible || baseline.dailyDemand <= 0) {
    return {
      daysRemaining: null, dailyDemand: baseline.dailyDemand, confidence: baseline.confidence, estimate: true,
      explanation: baseline.dailyDemand <= 0
        ? 'No recent sales, so a stockout time cannot be estimated.'
        : 'Not enough sales history to estimate a stockout time.',
      limitations: baseline.limitations,
    };
  }
  const days = Math.floor(available / baseline.dailyDemand);
  return {
    daysRemaining: days,
    dailyDemand: baseline.dailyDemand,
    confidence: baseline.confidence,
    estimate: true,
    explanation: `Based on recent sales of about ${round2(baseline.dailyDemand)} per day, ${available} may last about ${days} day(s).`,
    limitations: baseline.limitations,
  };
}

// --- statistics helpers ------------------------------------------------------

function mean(xs: number[]): number { return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0; }
function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}
function weightedMean(xs: number[]): number {
  // Linear recency weights: newest day weighted highest.
  if (!xs.length) return 0;
  let num = 0, den = 0;
  xs.forEach((v, i) => { const w = i + 1; num += v * w; den += w; });
  return den ? num / den : 0;
}
function coefficientOfVariation(xs: number[]): number {
  const m = mean(xs);
  if (m === 0) return Number.POSITIVE_INFINITY;
  const variance = mean(xs.map((x) => (x - m) ** 2));
  return Math.sqrt(variance) / m;
}
function round2(n: number): number { return Math.round(n * 100) / 100; }
function round3(n: number): number { return Math.round(n * 1000) / 1000; }
