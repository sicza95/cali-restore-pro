import { describe, expect, it } from 'vitest';
import { currencyMinorUnits } from './currency';
import { formatMoney } from './number';

describe('currencyMinorUnits', () => {
  it.each([
    ['HUF', 0],
    ['JPY', 0],
    ['EUR', 2],
    ['USD', 2],
    ['GBP', 2],
    ['CHF', 2],
    ['KWD', 3],
    ['ZZZ', 2],
  ])('%s has %d digits regardless of the engine Intl data', (currency, digits) => {
    expect(currencyMinorUnits(currency)).toBe(digits);
  });

  it('does not read engine data (a Firefox-like Intl that says HUF has 2 digits changes nothing)', () => {
    const real = Intl.NumberFormat;
    const fake = function (
      this: unknown,
      ...args: ConstructorParameters<typeof Intl.NumberFormat>
    ) {
      const formatter = new real(...args);
      const resolved = formatter.resolvedOptions.bind(formatter);
      formatter.resolvedOptions = () => ({ ...resolved(), maximumFractionDigits: 2 });
      return formatter;
    } as unknown as typeof Intl.NumberFormat;
    Intl.NumberFormat = fake;
    try {
      expect(currencyMinorUnits('HUF')).toBe(0);
    } finally {
      Intl.NumberFormat = real;
    }
  });

  it('formats money with explicit digits from the table', () => {
    const plain = (text: string) => text.replace(/[\u00a0\u202f]/g, ' ');
    expect(plain(formatMoney('430', 'HUF', 'en'))).toBe('HUF 430');
    expect(plain(formatMoney('430.4', 'HUF', 'hu'))).toBe('430 Ft');
    expect(formatMoney('1234.5', 'EUR', 'en')).toBe('€1,234.50');
    expect(plain(formatMoney('12.3456', 'HUF', 'en', true))).toBe('HUF 12.3456');
  });

  it('rejects a malformed code', () => {
    expect(() => currencyMinorUnits('huf')).toThrow('Invalid currency');
  });
});
