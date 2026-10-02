import { describe, it, expect } from 'vitest';
import {
  fixNumericOcr, extractPrintedPrice, extractManufacturer, extractPackSize,
  detectPromotional, extractBrandNameCandidates, extractAttributes,
} from './recognition.js';

describe('fixNumericOcr', () => {
  it('repairs common OCR digit/unit confusions in numeric tokens', () => {
    expect(fixNumericOcr('1O0')).toBe('100');
    expect(fixNumericOcr('5OO')).toBe('500');
    expect(fixNumericOcr('1k9')).toBe('1kg');
    expect(fixNumericOcr('250m1')).toBe('250ml');
  });
});

describe('extractPrintedPrice', () => {
  it('reads labelled prices with high confidence', () => {
    expect(extractPrintedPrice('MRP Rs 850')!.amountMinor).toBe(85000);
    expect(extractPrintedPrice('Retail Price: 1,250.00')!.amountMinor).toBe(125000);
    expect(extractPrintedPrice('Price 90')!.confidence).toBe('high');
  });
  it('reads trailing-currency prices', () => {
    expect(extractPrintedPrice('850/-')!.amountMinor).toBe(85000);
    expect(extractPrintedPrice('120 روپے')!.amountMinor).toBe(12000);
  });
  it('does NOT treat a manufacturing date or batch as a price', () => {
    expect(extractPrintedPrice('MFG 2024')).toBeNull();
    expect(extractPrintedPrice('Batch No 55231')).toBeNull();
  });
  it('does NOT treat a bare year as a price', () => {
    expect(extractPrintedPrice('2023')).toBeNull();
  });
  it('warns when multiple prices are present', () => {
    const p = extractPrintedPrice('MRP Rs 850\nOffer Price 799');
    expect(p).not.toBeNull();
    expect(p!.warnings.join(' ')).toMatch(/multiple/);
  });
});

describe('extractManufacturer', () => {
  it('captures manufacturer, distinguishing from distributor', () => {
    expect(extractManufacturer('Manufactured by Unilever Pakistan Ltd')!.relation).toBe('manufactured');
    expect(extractManufacturer('Distributed by ABC Traders')!.relation).toBe('distributed');
  });
  it('returns null when absent', () => {
    expect(extractManufacturer('Just a product name')).toBeNull();
  });
});

describe('extractPackSize (OCR-aware)', () => {
  it('finds the size line and repairs OCR confusion', () => {
    expect(extractPackSize('Surf Excel\n1 kg\nMRP 850')!.baseQuantity).toBe(1000);
    expect(extractPackSize('Net 5OO g')!.baseQuantity).toBe(500); // 5OO -> 500
  });
});

describe('detectPromotional', () => {
  it('flags promo words and percentage offers', () => {
    expect(detectPromotional('New Improved Extra Value').isPromotional).toBe(true);
    expect(detectPromotional('20% extra free').terms).toContain('percent_offer');
    expect(detectPromotional('Surf Excel 1kg').isPromotional).toBe(false);
  });
});

describe('extractBrandNameCandidates', () => {
  it('keeps identity lines and drops promo/size-only lines', () => {
    const c = extractBrandNameCandidates('Surf Excel\nNew Improved\n1 kg\nRs 850');
    expect(c).toContain('surf excel');
    expect(c).not.toContain('new improved'); // promo words stripped -> empty -> dropped
  });
});

describe('extractAttributes (integration of the extractor)', () => {
  it('produces a coherent structured result for a clear English package', () => {
    const a = extractAttributes('Surf Excel\nDetergent Powder\n1 kg\nMRP Rs 850\nManufactured by Unilever');
    expect(a.packSize!.baseQuantity).toBe(1000);
    expect(a.printedPrice!.amountMinor).toBe(85000);
    expect(a.manufacturer!.text).toMatch(/Unilever/);
    expect(a.brandNameCandidates).toContain('surf excel');
    expect(a.promotional.isPromotional).toBe(false);
  });
  it('handles empty text safely', () => {
    const a = extractAttributes('');
    expect(a.warnings).toContain('no text');
    expect(a.packSize).toBeNull();
    expect(a.printedPrice).toBeNull();
  });
});
