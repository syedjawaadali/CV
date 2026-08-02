import { describe, it, expect } from 'vitest';
import { toMinor, toMajor, addMinor, subMinor, mulMinor, formatMoney, assertMinor, MoneyError } from './money.js';

describe('money (integer minor units)', () => {
  it('converts rupees to paisa without floating error', () => {
    expect(toMinor(19.99)).toBe(1999);
    expect(toMinor(100)).toBe(10000);
    expect(toMinor(0)).toBe(0);
    expect(toMinor(0.1 + 0.2)).toBe(30); // 0.30000000000000004 -> 30
  });

  it('round-trips major/minor', () => {
    expect(toMajor(1999)).toBe(19.99);
    expect(toMajor(10000)).toBe(100);
  });

  it('adds and subtracts exactly', () => {
    expect(addMinor(1999, 9001, 100)).toBe(11100);
    expect(subMinor(10000, 2500)).toBe(7500);
  });

  it('multiplies by integer quantity', () => {
    expect(mulMinor(12000, 3)).toBe(36000);
  });

  it('rejects non-integer minor amounts', () => {
    expect(() => assertMinor(10.5)).toThrow(MoneyError);
    expect(() => mulMinor(100, 1.5)).toThrow(MoneyError);
  });

  it('formats currency with Rs prefix', () => {
    expect(formatMoney(150000)).toContain('Rs');
    expect(formatMoney(150000)).toContain('1,500');
  });
});
