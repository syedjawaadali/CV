import { normalizeBarcode } from './normalize.js';

/**
 * Deterministic barcode handling for the Knowledge Base. Barcodes are ALWAYS
 * strings (leading zeros preserved) and are treated as untrusted input. Check
 * digits are validated for standard retail formats, but a failed check digit
 * does NOT block storage — many local labels use internal codes. Instead we
 * classify the value so callers and reviewers can decide.
 */

export type BarcodeClass =
  | 'standard_valid' // recognized format, check digit OK
  | 'standard_invalid' // recognized length, check digit wrong
  | 'internal_code' // in-store / weighed-item range (e.g. EAN-13 starting 20-29)
  | 'unknown_format' // not a standard length
  | 'empty';

export interface BarcodeInfo {
  raw: string;
  normalized: string;
  format: 'EAN-13' | 'UPC-A' | 'EAN-8' | 'UPC-E' | 'unknown';
  classification: BarcodeClass;
  checkDigitValid: boolean | null; // null when format has no check digit here
  isNumeric: boolean;
}

function eanCheckDigit(digits: string): number {
  // EAN-13/EAN-8: from the right, alternating weights 3,1,3,1... over all but last.
  const body = digits.slice(0, -1).split('').map(Number);
  let sum = 0;
  // Weight 3 applies to the right-most body digit.
  for (let i = 0; i < body.length; i++) {
    const fromRight = body.length - 1 - i;
    sum += body[i]! * (fromRight % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10;
}

function upcaCheckDigit(digits: string): number {
  // UPC-A (12): odd positions (1-indexed from left) weight 3, even weight 1.
  const body = digits.slice(0, -1).split('').map(Number);
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    sum += body[i]! * (i % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10;
}

export function analyzeBarcode(input: string | null | undefined): BarcodeInfo {
  const raw = (input ?? '');
  const normalized = normalizeBarcode(raw);
  const isNumeric = /^[0-9]+$/.test(normalized);

  if (!normalized) {
    return { raw, normalized, format: 'unknown', classification: 'empty', checkDigitValid: null, isNumeric: false };
  }

  let format: BarcodeInfo['format'] = 'unknown';
  let checkDigitValid: boolean | null = null;

  if (isNumeric && normalized.length === 13) {
    format = 'EAN-13';
    checkDigitValid = Number(normalized[12]) === eanCheckDigit(normalized);
  } else if (isNumeric && normalized.length === 12) {
    format = 'UPC-A';
    checkDigitValid = Number(normalized[11]) === upcaCheckDigit(normalized);
  } else if (isNumeric && normalized.length === 8) {
    format = 'EAN-8';
    checkDigitValid = Number(normalized[7]) === eanCheckDigit(normalized);
  } else if (isNumeric && normalized.length === 6) {
    format = 'UPC-E';
    checkDigitValid = null; // UPC-E expansion not validated here
  }

  // In-store / restricted-circulation prefixes on EAN-13: 02, 20-29 (weighed items).
  const isInternal =
    format === 'EAN-13' && /^(02|2[0-9])/.test(normalized);

  let classification: BarcodeClass;
  if (isInternal) classification = 'internal_code';
  else if (format === 'unknown') classification = 'unknown_format';
  else if (checkDigitValid === false) classification = 'standard_invalid';
  else classification = 'standard_valid';

  return { raw, normalized, format, classification, checkDigitValid, isNumeric };
}

/** Convenience: is this a well-formed standard retail barcode we trust as a key? */
export function isTrustedBarcode(input: string | null | undefined): boolean {
  const info = analyzeBarcode(input);
  return info.classification === 'standard_valid';
}
