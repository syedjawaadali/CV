/**
 * Store memory & self-learning ranking (Phase 7) — pure, deterministic,
 * transparent. Confirmed/rejected local behavior becomes SUPPORTING evidence
 * that nudges candidate ranking; it NEVER overrides a hard contradiction
 * (pack-size/variant/brand/barcode conflict, retired, suspicious) and never
 * changes financial/inventory/catalog records. One retailer's memory is never
 * shared with another.
 */

export type MemoryState =
  | 'suggested' | 'confirmed_once' | 'repeatedly_confirmed' | 'trusted_locally'
  | 'conflicted' | 'rejected' | 'expired' | 'disabled';

export interface MemoryCounters {
  confirmationCount: number;
  rejectionCount: number;
  userApproved: boolean;
  active: boolean;
  expired?: boolean;
}

/** Deterministic memory-confidence state machine. */
export function memoryState(c: MemoryCounters): MemoryState {
  if (!c.active) return 'disabled';
  if (c.expired) return 'expired';
  // Conflicted: meaningful evidence on BOTH sides — never auto-trusted.
  if (c.confirmationCount > 0 && c.rejectionCount > 0 && c.rejectionCount >= c.confirmationCount) return 'conflicted';
  if (c.rejectionCount > 0 && c.confirmationCount === 0) return 'rejected';
  if (c.userApproved && c.confirmationCount >= 3) return 'trusted_locally';
  if (c.confirmationCount >= 3) return 'repeatedly_confirmed';
  if (c.confirmationCount === 1 || c.userApproved) return 'confirmed_once';
  return 'suggested';
}

/** A conflicted / rejected / disabled memory must NOT be applied automatically. */
export function memoryUsable(state: MemoryState): boolean {
  return state === 'confirmed_once' || state === 'repeatedly_confirmed' || state === 'trusted_locally';
}

export interface LearningSignal {
  productId: string;
  confirmed: number;   // times this product was confirmed for similar input
  rejected: number;    // times it was rejected (negative feedback)
}

export interface LearningVerdict {
  locallyPreferred: boolean;
  locallyRejected: boolean;
  reason: string;
}

/**
 * Turn raw confirmed/rejected counts into ranking evidence. Preference requires
 * net-positive confirmations; rejection requires rejections to dominate. Neither
 * is a hard signal — the scorer keeps contradictions authoritative.
 */
export function learningVerdict(sig: LearningSignal): LearningVerdict {
  const net = sig.confirmed - sig.rejected;
  if (sig.rejected > 0 && sig.rejected > sig.confirmed) {
    return { locallyPreferred: false, locallyRejected: true, reason: 'previously rejected here' };
  }
  if (net >= 1) {
    return { locallyPreferred: true, locallyRejected: false, reason: 'you confirmed this before' };
  }
  return { locallyPreferred: false, locallyRejected: false, reason: 'no strong local history' };
}

// --- Community catalog learning + anti-poisoning (pure) ----------------------

export interface CommunityEvidence {
  uniqueTenants: number;    // distinct tenants that independently confirmed
  totalConfirmations: number;
  conflicts: number;
  sameSourceRepeat: number; // confirmations from one source beyond the first (deduped)
}

export type CommunityStatus = 'pending' | 'eligible_for_review' | 'conflicted' | 'suspicious';

export const COMMUNITY_MIN = { uniqueTenants: 3, maxSameSourceRepeat: 5 };

/**
 * Whether a catalog-review candidate is eligible for HUMAN review. It is NEVER
 * auto-published. Requires independent tenants; flags conflicts/suspicious
 * concentration for anti-poisoning.
 */
export function communityStatus(e: CommunityEvidence, cfg = COMMUNITY_MIN): CommunityStatus {
  if (e.sameSourceRepeat > cfg.maxSameSourceRepeat) return 'suspicious';
  if (e.conflicts > 0 && e.conflicts >= e.uniqueTenants) return 'conflicted';
  if (e.uniqueTenants >= cfg.uniqueTenants) return 'eligible_for_review';
  return 'pending';
}
