import { formatMoney, toMajor } from '@smartdukaan/shared';

/** Format integer paisa as a localized PKR string, e.g. "Rs 1,250". */
export function money(minor: number, locale: 'en' | 'ur' = 'en'): string {
  return formatMoney(minor, locale);
}

/** Paisa → rupees number, for pre-filling numeric inputs. */
export function toRupees(minor: number): number {
  return toMajor(minor);
}

/** A numeric-string quantity from the API → trimmed display ("8.000" → "8"). */
export function qty(value: string | number): string {
  const n = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(n)) return String(value);
  return n.toLocaleString('en-US', { maximumFractionDigits: 3 });
}

const DATE_FMT = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit', month: 'short', year: 'numeric',
  timeZone: 'Asia/Karachi',
});
const TIME_FMT = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit', minute: '2-digit', hour12: true,
  timeZone: 'Asia/Karachi',
});

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : DATE_FMT.format(d);
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : `${DATE_FMT.format(d)}, ${TIME_FMT.format(d)}`;
}

/** Today's business date (Asia/Karachi) as YYYY-MM-DD. */
export function karachiToday(): string {
  // en-CA gives ISO-like YYYY-MM-DD ordering.
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(new Date());
}
