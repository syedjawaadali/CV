/**
 * Spoken unit normalization (Phase 5) — pure, deterministic. Maps English /
 * Roman-Urdu / Urdu unit words to a canonical unit. Ambiguous or unknown units
 * return `null` so the caller clarifies rather than silently converting.
 */

export type CanonicalUnit =
  | 'piece' | 'packet' | 'box' | 'carton' | 'bottle' | 'can' | 'sachet' | 'pouch'
  | 'kg' | 'g' | 'liter' | 'ml' | 'dozen' | 'bundle' | 'meter' | 'tray' | 'case';

const UNIT_MAP: Record<string, CanonicalUnit> = {
  piece: 'piece', pieces: 'piece', pc: 'piece', pcs: 'piece', item: 'piece', items: 'piece', adad: 'piece', عدد: 'piece', dana: 'piece', دانہ: 'piece',
  packet: 'packet', packets: 'packet', pkt: 'packet', pack: 'packet', packs: 'packet', پیکٹ: 'packet',
  box: 'box', boxes: 'box', dibba: 'box', ڈبہ: 'box', dabba: 'box',
  carton: 'carton', cartons: 'carton', کارٹن: 'carton', peti: 'carton', پیٹی: 'carton',
  bottle: 'bottle', bottles: 'bottle', botal: 'bottle', بوتل: 'bottle',
  can: 'can', cans: 'can', کین: 'can',
  sachet: 'sachet', sachets: 'sachet', ساشے: 'sachet',
  pouch: 'pouch', pouches: 'pouch',
  kg: 'kg', kilo: 'kg', kilos: 'kg', kilogram: 'kg', kilograms: 'kg', کلو: 'kg', کلوگرام: 'kg',
  g: 'g', gram: 'g', grams: 'g', gm: 'g', gms: 'g', گرام: 'g',
  liter: 'liter', litre: 'liter', liters: 'liter', litres: 'liter', ltr: 'liter', l: 'liter', لیٹر: 'liter',
  ml: 'ml', milliliter: 'ml', millilitre: 'ml', ملی: 'ml',
  dozen: 'dozen', dozens: 'dozen', darjan: 'dozen', درجن: 'dozen',
  bundle: 'bundle', bundles: 'bundle', gaddi: 'bundle', گڈی: 'bundle',
  meter: 'meter', metre: 'meter', meters: 'meter', میٹر: 'meter', gaz: 'meter',
  tray: 'tray', trays: 'tray', ٹرے: 'tray',
  case: 'case', cases: 'case',
};

export interface ParsedUnit { unit: CanonicalUnit | null; matchedText: string; confidence: number }

/** Find the first recognizable unit token in a (space-tokenized) transcript. */
export function parseSpokenUnit(input: string): ParsedUnit {
  const tokens = input.toLowerCase().split(/[\s,]+/).filter(Boolean);
  for (const t of tokens) {
    const u = UNIT_MAP[t];
    if (u) return { unit: u, matchedText: t, confidence: 0.9 };
  }
  return { unit: null, matchedText: '', confidence: 0 };
}

export function isKnownUnitWord(token: string): boolean {
  return UNIT_MAP[token.toLowerCase()] !== undefined;
}
