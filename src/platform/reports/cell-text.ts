import type { AreaUnit } from '../estimates/types';
import {
  formatArea,
  formatHours,
  formatMoney,
  formatNumber,
  formatPercent,
  formatRate,
  type LengthUnit,
  type NumberLanguage,
} from '../format/number';
import type { Cell } from './export-rows';

const sizes = new Set(['m²', 'cm²', 'ft²', 'in²', 'm', 'cm', 'ft', 'in']);

/**
 * A report value as people read it (preview, PDF, SVG): rounded for its unit, in the report's
 * language. CSV and XLSX keep the exact cell instead.
 */
export function cellText(value: Cell, unit: string | undefined, language: NumberLanguage) {
  if (value === null) return '—';
  if (typeof value === 'string') return unit ? value + ' ' + unit : value;
  if (!unit) return formatNumber(value, language);
  if (sizes.has(unit)) return formatArea(value, unit as AreaUnit | LengthUnit, language);
  if (unit === '%') return formatPercent(value, language);
  if (unit === 'h') return formatHours(value, language) + ' h';
  const rate = /^([A-Z]{3})(?:\/(.+))?$/.exec(unit);
  if (rate?.[2]) return formatRate(value, rate[1]!, rate[2] as AreaUnit | 'h', language);
  if (rate) return formatMoney(value, rate[1]!, language);
  return formatNumber(value, language) + ' ' + unit;
}
