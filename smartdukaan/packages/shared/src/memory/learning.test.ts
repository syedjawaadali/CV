import { describe, it, expect } from 'vitest';
import {
  memoryState, memoryUsable, learningVerdict, communityStatus, COMMUNITY_MIN,
} from './learning.js';
import { scoreCandidate, confidenceCategory, type CandidateEvidence } from '../scoring.js';

describe('memory state machine', () => {
  it('escalates confirmations to trusted; usable only when not conflicted/rejected', () => {
    expect(memoryState({ confirmationCount: 0, rejectionCount: 0, userApproved: false, active: true })).toBe('suggested');
    expect(memoryState({ confirmationCount: 1, rejectionCount: 0, userApproved: false, active: true })).toBe('confirmed_once');
    expect(memoryState({ confirmationCount: 3, rejectionCount: 0, userApproved: false, active: true })).toBe('repeatedly_confirmed');
    expect(memoryState({ confirmationCount: 3, rejectionCount: 0, userApproved: true, active: true })).toBe('trusted_locally');
  });
  it('conflicted memory is NOT usable automatically', () => {
    const s = memoryState({ confirmationCount: 2, rejectionCount: 2, userApproved: true, active: true });
    expect(s).toBe('conflicted');
    expect(memoryUsable(s)).toBe(false);
  });
  it('rejected / disabled / expired are not usable', () => {
    expect(memoryUsable(memoryState({ confirmationCount: 0, rejectionCount: 2, userApproved: false, active: true }))).toBe(false);
    expect(memoryUsable(memoryState({ confirmationCount: 5, rejectionCount: 0, userApproved: true, active: false }))).toBe(false);
    expect(memoryUsable(memoryState({ confirmationCount: 5, rejectionCount: 0, userApproved: true, active: true, expired: true }))).toBe(false);
  });
});

describe('learning verdict → ranking evidence', () => {
  it('net-positive confirmations mark a candidate locally preferred', () => {
    const v = learningVerdict({ productId: 'p', confirmed: 2, rejected: 0 });
    expect(v.locallyPreferred).toBe(true);
    expect(v.locallyRejected).toBe(false);
  });
  it('dominant rejections mark it locally rejected', () => {
    const v = learningVerdict({ productId: 'p', confirmed: 1, rejected: 3 });
    expect(v.locallyRejected).toBe(true);
  });
});

describe('learning never overrides safety', () => {
  it('locallyPreferred boosts score but a pack-size contradiction still wins (conflict)', () => {
    const ev: CandidateEvidence = { barcode: 'retailer_exact', locallyPreferred: true, packSizeContradiction: true };
    expect(confidenceCategory(scoreCandidate(ev), ev)).toBe('conflict');
  });
  it('locallyRejected lowers score but does NOT turn an exact barcode into a conflict', () => {
    const ev: CandidateEvidence = { barcode: 'retailer_exact', locallyRejected: true };
    const s = scoreCandidate(ev);
    expect(s.score).toBe(82); // 100 - 18
    expect(s.contradictions.length).toBe(0);
    expect(confidenceCategory(s, ev)).not.toBe('conflict'); // soft feedback is not a hard conflict
  });
  it('locallyPreferred helps a weak name-only match rank up', () => {
    const withPref = scoreCandidate({ exactNormalizedName: true, locallyPreferred: true }).score;
    const without = scoreCandidate({ exactNormalizedName: true }).score;
    expect(withPref).toBeGreaterThan(without);
  });
});

describe('community catalog learning + anti-poisoning', () => {
  it('needs enough independent tenants before human review', () => {
    expect(communityStatus({ uniqueTenants: 1, totalConfirmations: 5, conflicts: 0, sameSourceRepeat: 0 })).toBe('pending');
    expect(communityStatus({ uniqueTenants: COMMUNITY_MIN.uniqueTenants, totalConfirmations: 3, conflicts: 0, sameSourceRepeat: 0 })).toBe('eligible_for_review');
  });
  it('flags coordinated same-source submissions as suspicious', () => {
    expect(communityStatus({ uniqueTenants: 5, totalConfirmations: 20, conflicts: 0, sameSourceRepeat: 10 })).toBe('suspicious');
  });
  it('conflicts block eligibility', () => {
    expect(communityStatus({ uniqueTenants: 3, totalConfirmations: 6, conflicts: 4, sameSourceRepeat: 0 })).toBe('conflicted');
  });
});
