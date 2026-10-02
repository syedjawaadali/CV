/**
 * Recognition fusion (Phase 4) — pure, deterministic.
 *
 * Combines every recognition signal (barcode, OCR, alias, structured
 * attributes, visual fingerprint/embedding, retailer history, and a cloud-AI
 * result when present) into ONE confidence decision, and decides — from local
 * evidence alone — whether a cloud-AI fallback is even justified.
 *
 * Design rules enforced here:
 *  - Visual similarity is one input, never the sole identity signal.
 *  - A cloud provider's own "confidence" NEVER overrides a local contradiction.
 *  - Cloud fallback is justified only when local evidence is genuinely weak AND
 *    there is no hard contradiction that a human must resolve first.
 */

import {
  scoreCandidate, confidenceCategory, decideAction,
  RECOGNITION_CONFIG, type CandidateEvidence, type ConfidenceCategory,
  type RecommendedAction, type RecognitionConfig, type ScoreResult,
} from './scoring.js';

export interface EvidenceCompleteness {
  hasBarcode: boolean;
  hasExactBarcode: boolean;   // retailer_exact or shared_verified
  hasOcrName: boolean;
  hasPackSize: boolean;
  hasVisual: boolean;         // any usable perceptual/content/embedding signal
  hasStrongVisual: boolean;   // content-identical or perceptual-near
  score: number;              // 0..1, coarse completeness
}

export interface FusionResult {
  top: ScoreResult | null;
  category: ConfidenceCategory;
  recommendedAction: RecommendedAction;
  topIsRetailer: boolean;
  completeness: EvidenceCompleteness;
  cloudFallbackJustified: boolean;
  cloudFallbackReason: string;
  humanConfirmationRequired: boolean;
}

export interface FusionCandidateInput {
  isRetailer: boolean;
  evidence: CandidateEvidence;
}

/** Coarse completeness of the LOCAL evidence for the best candidate + context. */
export function evidenceCompleteness(
  best: CandidateEvidence | undefined,
  ctx: { barcodePresent: boolean; ocrName: boolean; packSize: boolean; visualPresent: boolean },
): EvidenceCompleteness {
  const hasExactBarcode = best?.barcode === 'retailer_exact' || best?.barcode === 'shared_verified';
  const hasStrongVisual = best?.contentHashIdentical === true || best?.perceptualNear === true;
  const hasVisual = ctx.visualPresent && (
    hasStrongVisual || best?.perceptualSimilar === true || (best?.embeddingSimilar ?? 0) > 0);
  let score = 0;
  if (hasExactBarcode) score += 0.6;
  else if (ctx.barcodePresent) score += 0.2;
  if (ctx.ocrName) score += 0.15;
  if (ctx.packSize) score += 0.1;
  if (hasStrongVisual) score += 0.25;
  else if (hasVisual) score += 0.1;
  return {
    hasBarcode: ctx.barcodePresent,
    hasExactBarcode,
    hasOcrName: ctx.ocrName,
    hasPackSize: ctx.packSize,
    hasVisual,
    hasStrongVisual,
    score: Math.min(1, Number(score.toFixed(3))),
  };
}

/**
 * Fuse local candidates into one decision. Cloud fallback is justified only
 * when the local top result is weak (medium/low, non-conflict) and evidence is
 * incomplete — never when there is a hard conflict a human must resolve, and
 * never when we already have an exact/high local result.
 */
export function fuseLocalEvidence(
  candidates: FusionCandidateInput[],
  ctx: { barcodePresent: boolean; ocrName: boolean; packSize: boolean; visualPresent: boolean },
  cfg: RecognitionConfig = RECOGNITION_CONFIG,
): FusionResult {
  const scored = candidates
    .map((c) => ({ c, res: scoreCandidate(c.evidence, cfg) }))
    .sort((a, b) => b.res.score - a.res.score);
  const top = scored[0];
  const completeness = evidenceCompleteness(top?.c.evidence, ctx);

  if (!top) {
    return {
      top: null, category: 'low', recommendedAction: 'manual_or_create', topIsRetailer: false,
      completeness,
      cloudFallbackJustified: ctx.visualPresent || ctx.ocrName,
      cloudFallbackReason: ctx.visualPresent || ctx.ocrName
        ? 'no local candidate; image/text available for online check'
        : 'no local candidate and no image/text to check',
      humanConfirmationRequired: true,
    };
  }

  const category = confidenceCategory(top.res, top.c.evidence, cfg);
  const topIsRetailer = top.c.isRetailer;
  const recommendedAction = decideAction(category, topIsRetailer);

  // Cloud fallback gate — local-only reasoning.
  let cloudFallbackJustified = false;
  let cloudFallbackReason: string;
  if (category === 'conflict') {
    cloudFallbackReason = 'local conflict must be resolved by a human first';
  } else if (category === 'exact' || category === 'high') {
    cloudFallbackReason = 'strong local match; cloud not needed';
  } else if (!ctx.visualPresent && !ctx.ocrName) {
    cloudFallbackReason = 'no image or text for the provider to analyze';
  } else {
    cloudFallbackJustified = true;
    cloudFallbackReason = category === 'low'
      ? 'weak local evidence; online check may help'
      : 'ambiguous local evidence; online check may disambiguate';
  }

  const humanConfirmationRequired = category !== 'exact' || !topIsRetailer;
  return {
    top: top.res, category, recommendedAction, topIsRetailer,
    completeness, cloudFallbackJustified, cloudFallbackReason, humanConfirmationRequired,
  };
}

/**
 * Final confidence AFTER a cloud result arrives. A provider result is treated
 * as an additional (weak) signal: it can lift a low/medium local result toward
 * a candidate list, but a local hard contradiction or barcode conflict ALWAYS
 * wins — the provider can never upgrade past a human-review requirement.
 */
export function fuseWithCloud(
  local: FusionResult,
  cloud: { hasCandidate: boolean; providerConfidence: number; contradictsLocal: boolean },
): { category: ConfidenceCategory; humanConfirmationRequired: boolean; note: string } {
  if (local.category === 'conflict' || local.top?.hardConflict) {
    return { category: 'conflict', humanConfirmationRequired: true, note: 'local conflict overrides provider result' };
  }
  if (cloud.contradictsLocal) {
    return { category: 'medium', humanConfirmationRequired: true, note: 'provider disagrees with local evidence; needs review' };
  }
  if (!cloud.hasCandidate) {
    return { category: 'low', humanConfirmationRequired: true, note: 'provider found no confident match' };
  }
  // A cloud suggestion is never auto-verified: cap at 'medium', always confirm.
  return { category: 'medium', humanConfirmationRequired: true, note: 'online suggestion — please confirm' };
}
