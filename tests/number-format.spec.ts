import { expect, test } from '@playwright/test';
import {
  formatArea,
  formatFileSize,
  formatHours,
  formatMoney,
  formatNumber,
  formatPercent,
  formatRate,
} from '../src/platform/format/number';

/** Intl and the formatter use no-break spaces; tests write plain ones. */
const plain = (text: string) => text.replace(/[\u00a0\u202f]/g, ' ');

test('areas use unit precision in English and Hungarian', () => {
  const cases: [number | string, Parameters<typeof formatArea>[1], string, string][] = [
    [0.00113388, 'ft²', '0.0011 ft²', '0,0011 ft²'],
    [1234.5678, 'm²', '1,234.57 m²', '1234,57 m²'],
    [1234567.891, 'm²', '1,234,567.89 m²', '1 234 567,89 m²'],
    [12.345, 'cm²', '12.3 cm²', '12,3 cm²'],
    [0.5678, 'in²', '0.57 in²', '0,57 in²'],
    [6, 'm²', '6 m²', '6 m²'],
    [0, 'm²', '0 m²', '0 m²'],
    ['0.000123456789012345', 'm²', '0.0001 m²', '0,0001 m²'],
    [0.00001, 'm²', '< 0.0001 m²', '< 0,0001 m²'],
    [-0.25, 'ft²', '-0.25 ft²', '-0,25 ft²'],
    [2.5, 'm', '2.5 m', '2,5 m'],
  ];
  for (const [value, unit, en, hu] of cases) {
    expect(plain(formatArea(value, unit, 'en')), `${value} ${unit} en`).toBe(en);
    expect(plain(formatArea(value, unit, 'hu')), `${value} ${unit} hu`).toBe(hu);
  }
  expect(plain(formatArea(0.4, 'm²', 'en', true))).toBe('+0.4 m²');
  expect(formatArea(null, 'm²', 'en')).toBe('—');
  expect(formatArea('', 'm²', 'hu')).toBe('—');
});

test('percentages, hours and plain numbers', () => {
  expect(formatPercent(37.5432, 'en')).toBe('37.5%');
  expect(formatPercent(37.5432, 'hu')).toBe('37,5%');
  expect(formatPercent(0.0312, 'en')).toBe('0.031%');
  expect(formatPercent(100, 'hu')).toBe('100%');
  expect(formatPercent(-5, 'en', true)).toBe('-5%');
  expect(formatHours('2.250000000000000000', 'en')).toBe('2.25');
  expect(formatHours('1234.5', 'hu')).toBe('1234,5');
  expect(plain(formatHours('12345.678', 'hu'))).toBe('12 345,68');
  expect(formatHours(undefined, 'en')).toBe('—');
  expect(formatNumber('1,5', 'en')).toBe('1.5');
  expect(formatNumber('1.5', 'hu')).toBe('1,5');
  expect(formatNumber('abc', 'en')).toBe('—');
});

test('money and rates follow the currency', () => {
  expect(plain(formatMoney('430', 'HUF', 'en'))).toBe('HUF 430');
  expect(plain(formatMoney('430', 'HUF', 'hu'))).toBe('430 Ft');
  expect(formatMoney('1234.5', 'EUR', 'en')).toBe('€1,234.50');
  expect(plain(formatMoney('1234.5', 'EUR', 'hu'))).toBe('1234,50 EUR');
  expect(plain(formatMoney('1234567', 'JPY', 'hu'))).toBe('1 234 567 ¥');
  expect(formatMoney(null, 'EUR', 'en')).toBe('—');
  expect(formatRate('12.345', 'EUR', 'm²', 'en')).toBe('€12.345/m²');
  expect(formatRate('45', 'EUR', 'h', 'en')).toBe('€45.00/h');
  expect(formatRate('300', 'EUR', undefined, 'en')).toBe('€300.00');
});

test('file sizes', () => {
  expect(plain(formatFileSize(512, 'en'))).toBe('512 B');
  expect(plain(formatFileSize(13565, 'en'))).toBe('13.2 KB');
  expect(plain(formatFileSize(13565, 'hu'))).toBe('13,2 KB');
  expect(plain(formatFileSize(5 * 1024 ** 3, 'en'))).toBe('5 GB');
});
