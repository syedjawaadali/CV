import { describe, it, expect } from 'vitest';
import { analyzeBarcode, isTrustedBarcode } from './barcode.js';

describe('analyzeBarcode', () => {
  it('validates a real EAN-13 check digit', () => {
    // 5901234123457 is a well-known valid EAN-13.
    const r = analyzeBarcode('5901234123457');
    expect(r.format).toBe('EAN-13');
    expect(r.checkDigitValid).toBe(true);
    expect(r.classification).toBe('standard_valid');
  });

  it('flags a bad EAN-13 check digit as standard_invalid', () => {
    // The seeded demo barcode 8964000000017 is actually a fabricated code —
    // its check digit does not validate, which the classifier must catch.
    const r = analyzeBarcode('8964000000017');
    expect(r.format).toBe('EAN-13');
    expect(r.checkDigitValid).toBe(false);
    expect(r.classification).toBe('standard_invalid');
  });

  it('validates a UPC-A', () => {
    const r = analyzeBarcode('036000291452');
    expect(r.format).toBe('UPC-A');
    expect(r.checkDigitValid).toBe(true);
    expect(r.classification).toBe('standard_valid');
  });

  it('validates an EAN-8', () => {
    const r = analyzeBarcode('96385074');
    expect(r.format).toBe('EAN-8');
    expect(r.checkDigitValid).toBe(true);
  });

  it('classifies in-store/weighed EAN-13 (prefix 2x) as internal_code', () => {
    const r = analyzeBarcode('2011234500009');
    expect(r.classification).toBe('internal_code');
  });

  it('marks non-standard length as unknown_format', () => {
    expect(analyzeBarcode('12345').classification).toBe('unknown_format');
    expect(analyzeBarcode('ABC-123').classification).toBe('unknown_format');
  });

  it('preserves leading zeros and never treats value numerically for storage', () => {
    const r = analyzeBarcode(' 0012345678905 ');
    expect(r.normalized).toBe('0012345678905');
  });

  it('empty is classified empty', () => {
    expect(analyzeBarcode('').classification).toBe('empty');
    expect(analyzeBarcode(null).classification).toBe('empty');
  });

  it('isTrustedBarcode only for standard_valid', () => {
    expect(isTrustedBarcode('5901234123457')).toBe(true); // valid EAN-13
    expect(isTrustedBarcode('8964000000017')).toBe(false); // fabricated check digit
    expect(isTrustedBarcode('2011234500009')).toBe(false); // internal code
  });
});
