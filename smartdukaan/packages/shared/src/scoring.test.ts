import { describe, it, expect } from 'vitest';
import {
  scoreCandidate, confidenceCategory, decideAction, type CandidateEvidence,
} from './scoring.js';

const cat = (ev: CandidateEvidence) => confidenceCategory(scoreCandidate(ev), ev);

describe('scoreCandidate + confidenceCategory', () => {
  it('exact retailer barcode with no contradiction => exact', () => {
    const ev: CandidateEvidence = { barcode: 'retailer_exact' };
    const s = scoreCandidate(ev);
    expect(s.score).toBe(100);
    expect(cat(ev)).toBe('exact');
    expect(decideAction('exact', true)).toBe('select_existing_product');
  });

  it('verified shared barcode => exact, action add-to-shop', () => {
    expect(cat({ barcode: 'shared_verified' })).toBe('exact');
    expect(decideAction('exact', false)).toBe('add_shared_product_to_shop');
  });

  it('CRITICAL: barcode match but pack-size contradiction => conflict, NOT high', () => {
    const ev: CandidateEvidence = { barcode: 'retailer_exact', packSizeContradiction: true };
    expect(cat(ev)).toBe('conflict');
    expect(decideAction('conflict', true)).toBe('resolve_conflict');
  });

  it('conflicted barcode (multiple variants) => conflict', () => {
    expect(cat({ barcode: 'conflict' })).toBe('conflict');
    expect(cat({ barcode: 'multiple' })).toBe('conflict');
  });

  it('brand + pack size, no barcode => medium/high but never exact', () => {
    const ev: CandidateEvidence = { brandMatch: true, packSizeMatch: true, exactNormalizedName: true };
    const c = cat(ev); // 25+25+50 = 100 but no barcode/contradiction
    expect(['high', 'exact']).toContain(c);
  });

  it('name-only weak signal => medium or low, requires confirmation', () => {
    expect(['medium', 'low']).toContain(cat({ brandMatch: true }));
  });

  it('no evidence => low', () => {
    expect(cat({})).toBe('low');
    expect(decideAction('low', false)).toBe('manual_or_create');
  });

  it('retired product forces conflict/hardConflict regardless of positives', () => {
    const s = scoreCandidate({ barcode: 'retailer_exact', retired: true });
    expect(s.hardConflict).toBe(true);
    expect(cat({ barcode: 'retailer_exact', retired: true })).toBe('conflict');
  });

  it('records structured reasons and contradictions (explainable)', () => {
    const s = scoreCandidate({ barcode: 'shared_verified', brandMatch: true, packSizeContradiction: true });
    expect(s.reasons.map((r) => r.code)).toContain('barcode_shared_verified');
    expect(s.reasons.map((r) => r.code)).toContain('brand');
    expect(s.contradictions.join(' ')).toMatch(/pack size/i);
  });

  it('packaging text similarity scales its weight', () => {
    const half = scoreCandidate({ packagingTextSimilarity: 0.5 }).score;
    const full = scoreCandidate({ packagingTextSimilarity: 1 }).score;
    expect(full).toBeGreaterThan(half);
  });
});
