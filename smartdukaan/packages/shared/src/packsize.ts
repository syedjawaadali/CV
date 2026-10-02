/**
 * Deterministic pack-size parser (no AI). Turns free text like "1kg",
 * "24 x 250 ml", "Pack of 6", "2 dozen" into a structured, comparable size —
 * while ALWAYS keeping the original text and refusing to guess when unsure.
 */

export type PackConfidence = 'high' | 'medium' | 'low';

export interface ParsedPackSize {
  originalText: string;
  quantity: number | null; // numeric size of one item (e.g. 250 for "250 ml")
  unit: string | null; // canonical unit token (e.g. 'ml', 'kg', 'piece')
  unitsPerPack: number; // items in the pack (e.g. 24 for "24 x 250ml"); default 1
  baseQuantity: number | null; // one item's size in base unit (g / ml / piece)
  baseUnit: 'g' | 'ml' | 'piece' | null;
  confidence: PackConfidence;
  warnings: string[];
}

/** Alias → canonical unit. Ambiguous descriptors ("large") are intentionally absent. */
const UNIT_ALIASES: Record<string, string> = {
  kg: 'kg', kgs: 'kg', kilo: 'kg', kilos: 'kg', kilogram: 'kg', kilograms: 'kg',
  g: 'g', gm: 'g', gms: 'g', gram: 'g', grams: 'g', grm: 'g',
  mg: 'mg', milligram: 'mg', milligrams: 'mg',
  l: 'l', lt: 'l', ltr: 'l', ltrs: 'l', liter: 'l', litre: 'l', liters: 'l', litres: 'l',
  ml: 'ml', milliliter: 'ml', millilitre: 'ml',
  pc: 'piece', pcs: 'piece', piece: 'piece', pieces: 'piece', unit: 'piece', units: 'piece',
  dozen: 'dozen', dozens: 'dozen',
  pack: 'pack', packet: 'packet', packets: 'packet', pkt: 'packet',
  box: 'box', boxes: 'box', carton: 'carton', cartons: 'carton',
  bottle: 'bottle', bottles: 'bottle', can: 'can', cans: 'can',
  sachet: 'sachet', sachets: 'sachet', pouch: 'pouch', pouches: 'pouch',
  bundle: 'bundle', bundles: 'bundle', meter: 'meter', metre: 'meter', m: 'meter',
};

/** Canonical unit → base unit + multiplier (only for convertible measures). */
const BASE: Record<string, { unit: 'g' | 'ml' | 'piece'; factor: number }> = {
  kg: { unit: 'g', factor: 1000 },
  g: { unit: 'g', factor: 1 },
  l: { unit: 'ml', factor: 1000 },
  ml: { unit: 'ml', factor: 1 },
  dozen: { unit: 'piece', factor: 12 },
  piece: { unit: 'piece', factor: 1 },
};

const CONTAINERS = new Set(['pack', 'packet', 'box', 'carton', 'bottle', 'can', 'sachet', 'pouch', 'bundle']);
const NUM = '(\\d+(?:\\.\\d+)?)';
const UNIT_GROUP = '([a-z]+)';

function canonUnit(raw: string): string | null {
  return UNIT_ALIASES[raw.toLowerCase()] ?? null;
}

function withBase(p: ParsedPackSize): ParsedPackSize {
  if (p.unit && p.quantity != null && BASE[p.unit]) {
    const b = BASE[p.unit]!;
    p.baseQuantity = p.quantity * b.factor;
    p.baseUnit = b.unit;
  }
  return p;
}

export function parsePackSize(input: string | null | undefined): ParsedPackSize {
  const originalText = (input ?? '').trim();
  const base: ParsedPackSize = {
    originalText, quantity: null, unit: null, unitsPerPack: 1,
    baseQuantity: null, baseUnit: null, confidence: 'low', warnings: [],
  };
  if (!originalText) { base.warnings.push('empty'); return base; }
  const s = originalText.toLowerCase().replace(/\s+/g, ' ').trim();

  // "2 dozen"
  let m = s.match(new RegExp(`^${NUM}\\s*(dozen|dozens)\\b`));
  if (m) {
    const n = Number(m[1]);
    return withBase({ ...base, quantity: n, unit: 'dozen', unitsPerPack: 1, confidence: 'high' });
  }

  // Multipack: "24 x 250 ml", "6x1.5l"
  m = s.match(new RegExp(`^${NUM}\\s*[x×]\\s*${NUM}\\s*${UNIT_GROUP}`));
  if (m) {
    const per = Number(m[1]);
    const qty = Number(m[2]);
    const u = canonUnit(m[3]!);
    if (u) return withBase({ ...base, quantity: qty, unit: u, unitsPerPack: per, confidence: 'high' });
    return { ...base, unitsPerPack: per, confidence: 'medium', warnings: ['unknown unit in multipack'] };
  }

  // "pack of 6", "carton of 24", "box of 12"
  m = s.match(new RegExp(`^(${[...CONTAINERS].join('|')})\\s+of\\s+${NUM}`));
  if (m) {
    const per = Number(m[2]);
    return { ...base, unit: canonUnit(m[1]!), unitsPerPack: per, confidence: 'medium',
      warnings: ['pack count known, item size unknown'] };
  }

  // Simple "1 kg", "500g", "1.5 L", "12 pieces"
  m = s.match(new RegExp(`^${NUM}\\s*${UNIT_GROUP}\\b`));
  if (m) {
    const qty = Number(m[1]);
    const u = canonUnit(m[2]!);
    if (u) {
      const conf: PackConfidence = CONTAINERS.has(u) ? 'medium' : 'high';
      return withBase({ ...base, quantity: qty, unit: u, confidence: conf });
    }
    return { ...base, quantity: qty, confidence: 'low', warnings: [`unknown unit "${m[2]}"`] };
  }

  base.warnings.push('no recognizable size — preserved as text for confirmation');
  return base;
}
