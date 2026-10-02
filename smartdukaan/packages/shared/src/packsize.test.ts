import { describe, it, expect } from 'vitest';
import { parsePackSize } from './packsize.js';

describe('parsePackSize', () => {
  it('parses simple weight "1 kg"', () => {
    const r = parsePackSize('1 kg');
    expect(r.quantity).toBe(1);
    expect(r.unit).toBe('kg');
    expect(r.baseQuantity).toBe(1000);
    expect(r.baseUnit).toBe('g');
    expect(r.confidence).toBe('high');
  });

  it('treats 1kg, 1 Kg, 1000 g as equal base quantity', () => {
    expect(parsePackSize('1kg').baseQuantity).toBe(1000);
    expect(parsePackSize('1 Kg').baseQuantity).toBe(1000);
    expect(parsePackSize('1000 g').baseQuantity).toBe(1000);
  });

  it('parses volume "1.5 L" and "250 ml"', () => {
    expect(parsePackSize('1.5 L').baseQuantity).toBe(1500);
    expect(parsePackSize('250 ml').baseQuantity).toBe(250);
  });

  it('parses multipack "24 x 250 ml"', () => {
    const r = parsePackSize('24 x 250 ml');
    expect(r.unitsPerPack).toBe(24);
    expect(r.quantity).toBe(250);
    expect(r.unit).toBe('ml');
    expect(r.baseQuantity).toBe(250);
    expect(r.confidence).toBe('high');
  });

  it('parses "pack of 6" as medium confidence (item size unknown)', () => {
    const r = parsePackSize('pack of 6');
    expect(r.unitsPerPack).toBe(6);
    expect(r.confidence).toBe('medium');
    expect(r.quantity).toBeNull();
  });

  it('parses "2 dozen" to 24 pieces base', () => {
    const r = parsePackSize('2 dozen');
    expect(r.unit).toBe('dozen');
    expect(r.baseUnit).toBe('piece');
    expect(r.baseQuantity).toBe(24);
  });

  it('parses "12 pieces"', () => {
    const r = parsePackSize('12 pieces');
    expect(r.quantity).toBe(12);
    expect(r.unit).toBe('piece');
  });

  it('does NOT guess ambiguous descriptors', () => {
    const r = parsePackSize('family pack');
    expect(r.quantity).toBeNull();
    expect(r.unit).toBeNull();
    expect(r.confidence).toBe('low');
    expect(r.warnings.length).toBeGreaterThan(0);
    expect(r.originalText).toBe('family pack');
  });

  it('preserves original text always', () => {
    expect(parsePackSize('  1 KG  ').originalText).toBe('1 KG');
  });

  it('handles empty', () => {
    expect(parsePackSize('').confidence).toBe('low');
    expect(parsePackSize(null).quantity).toBeNull();
  });
});
