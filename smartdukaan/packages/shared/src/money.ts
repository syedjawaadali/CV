/**
 * Money is represented everywhere as an INTEGER number of minor units
 * (paisa for PKR: 1 rupee = 100 paisa). This avoids floating-point rounding
 * errors in financial calculations. The database stores the same integer in a
 * BIGINT column. Never use JS floating-point arithmetic for money.
 */

export const CURRENCY = 'PKR' as const;
export const MINOR_UNITS_PER_MAJOR = 100;

/** A branded integer type documenting that a value is minor units (paisa). */
export type Minor = number;

export class MoneyError extends Error {}

/** Assert a value is a safe integer number of minor units. */
export function assertMinor(value: number, label = 'amount'): Minor {
  if (!Number.isInteger(value)) {
    throw new MoneyError(`${label} must be an integer number of paisa, got ${value}`);
  }
  if (!Number.isSafeInteger(value)) {
    throw new MoneyError(`${label} is out of safe integer range`);
  }
  return value;
}

/** Convert a major-unit amount (rupees, may have up to 2 decimals) to paisa. */
export function toMinor(major: number): Minor {
  if (typeof major !== 'number' || Number.isNaN(major)) {
    throw new MoneyError(`invalid money value: ${major}`);
  }
  // Round to avoid binary floating point artefacts (e.g. 19.99 * 100 = 1998.9999).
  return Math.round(major * MINOR_UNITS_PER_MAJOR);
}

/** Convert paisa to a major-unit number (rupees) — for display only. */
export function toMajor(minor: Minor): number {
  return assertMinor(minor) / MINOR_UNITS_PER_MAJOR;
}

export function addMinor(...values: Minor[]): Minor {
  return values.reduce((acc, v) => assertMinor(acc + assertMinor(v)), 0);
}

export function subMinor(a: Minor, b: Minor): Minor {
  return assertMinor(assertMinor(a) - assertMinor(b));
}

/** Multiply a money amount by an integer quantity, staying in integers. */
export function mulMinor(amount: Minor, quantity: number): Minor {
  if (!Number.isInteger(quantity)) {
    throw new MoneyError(`quantity multiplier must be an integer, got ${quantity}`);
  }
  return assertMinor(assertMinor(amount) * quantity);
}

/**
 * Format paisa as a localized currency string.
 * @param locale 'en' | 'ur'
 */
export function formatMoney(minor: Minor, locale: 'en' | 'ur' = 'en'): string {
  assertMinor(minor);
  const major = toMajor(minor);
  const intl = locale === 'ur' ? 'ur-PK' : 'en-PK';
  const formatted = new Intl.NumberFormat(intl, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(major);
  // "Rs" is widely understood by Pakistani retailers in both scripts.
  return `Rs ${formatted}`;
}
