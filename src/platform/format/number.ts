/**
 * Shared number and unit formatting for everything shown on screen or in visual files (PDF, SVG).
 * Calculations, saved data and CSV/XLSX values keep exact machine numbers and do not use this.
 */
import type { AreaUnit } from '../estimates/types';

export type NumberLanguage = 'en' | 'hu';
export type NumberValue = number | string | null | undefined;
export type LengthUnit = 'm' | 'cm' | 'ft' | 'in';

/** Fraction digits per unit: metres and feet to the hundredth, the small units to a tenth. */
const unitDigits: Record<AreaUnit | LengthUnit, number> = {
  'm²': 2,
  'ft²': 2,
  'cm²': 1,
  'in²': 1,
  m: 2,
  ft: 2,
  cm: 1,
  in: 1,
};

/** Small values keep two significant digits, but never more fraction digits than this. */
const finest = 4;
const missing = '—';
/** Keeps a number and its unit on one line. */
const nbsp = '\u00a0';

const cache = new Map<string, Intl.NumberFormat>();
function formatter(language: NumberLanguage, options: Intl.NumberFormatOptions) {
  const key = language + JSON.stringify(options);
  let format = cache.get(key);
  if (!format) {
    format = new Intl.NumberFormat(language, options);
    cache.set(key, format);
  }
  return format;
}

/** A finite number from a number or a decimal string (point or comma), else null. */
export function toNumber(value: NumberValue): number | null {
  if (value === null || value === undefined) return null;
  const number =
    typeof value === 'number'
      ? value
      : value.trim() === ''
        ? NaN
        : Number(value.trim().replace(',', '.'));
  return Number.isFinite(number) ? number : null;
}

/** `base` fraction digits; below 1, enough for two significant digits, up to `finest`. */
function fractionDigits(value: number, base: number) {
  const size = Math.abs(value);
  if (size === 0 || size >= 1) return base;
  return Math.min(Math.max(base, 1 - Math.floor(Math.log10(size))), finest);
}

/**
 * A plain number in the reader's language, rounded to `base` fraction digits (two significant
 * digits for small values). Values too small to show read "< 0.0001". Missing values read "—".
 */
export function formatNumber(
  value: NumberValue,
  language: NumberLanguage,
  base = 2,
  signed = false,
): string {
  const number = toNumber(value);
  if (number === null) return missing;
  const signDisplay = signed ? 'exceptZero' : 'auto';
  if (number !== 0 && Math.abs(number) < 0.5 * 10 ** -finest) {
    const bound = formatter(language, { maximumFractionDigits: finest }).format(10 ** -finest);
    return (number < 0 ? '> -' : '< ') + bound;
  }
  const digits = fractionDigits(number, base);
  return formatter(language, { maximumFractionDigits: digits, signDisplay }).format(number);
}

/** An area or length with its unit: `0.0011 ft²`, `1,234.57 m²`, HU `12,5 cm²`. */
export function formatArea(
  value: NumberValue,
  unit: AreaUnit | LengthUnit,
  language: NumberLanguage,
  signed = false,
): string {
  const text = formatNumber(value, language, unitDigits[unit], signed);
  return text === missing ? missing : text + nbsp + unit;
}

/** A percentage to a tenth: `37.5%`, HU `37,5%`. */
export function formatPercent(value: NumberValue, language: NumberLanguage, signed = false) {
  const text = formatNumber(value, language, 1, signed);
  return text === missing ? missing : text + '%';
}

/** Hours to the hundredth, without a unit (labels name it). */
export function formatHours(value: NumberValue, language: NumberLanguage) {
  return formatNumber(value, language, 2);
}

function currencyDigits(currency: string) {
  try {
    return (
      new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions()
        .maximumFractionDigits ?? 2
    );
  } catch {
    return null;
  }
}

/**
 * Money in the currency's own precision: `HUF 1,234`, `€12.50`, HU `1234 Ft`. A rate keeps up to
 * four fraction digits, since a unit price may be finer than the currency.
 */
export function formatMoney(
  value: NumberValue,
  currency: string,
  language: NumberLanguage,
  rate = false,
): string {
  const number = toNumber(value);
  if (number === null) return missing;
  const digits = /^[A-Z]{3}$/.test(currency) ? currencyDigits(currency) : null;
  if (digits === null) return formatNumber(number, language) + (currency ? nbsp + currency : '');
  return formatter(language, {
    style: 'currency',
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: rate ? Math.max(digits, finest) : digits,
  }).format(number);
}

/** A unit price: `HUF 88/cm²`, `€45/h`; a fixed price has no unit. */
export function formatRate(
  value: NumberValue,
  currency: string,
  unit: AreaUnit | 'h' | undefined,
  language: NumberLanguage,
) {
  const text = formatMoney(value, currency, language, true);
  return text === missing || !unit ? text : text + '/' + unit;
}

/** A file size in bytes, KB, MB or GB (1024-based) to a tenth: `13.2 KB`, HU `13,2 KB`. */
export function formatFileSize(bytes: number, language: NumberLanguage) {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index++;
  }
  const text = formatter(language, { maximumFractionDigits: index ? 1 : 0 }).format(size);
  return text + nbsp + units[index];
}
