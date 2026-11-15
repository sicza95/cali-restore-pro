import { describe, expect, it } from 'vitest';
import { Decimal, decimal, nonnegative, sum } from './decimal';

describe('Decimal parsing', () => {
  it.each([
    ['1.5', 3n, 2n],
    ['1,5', 3n, 2n],
    ['.25', 1n, 4n],
    ['-.5', -1n, 2n],
    ['-1.5', -3n, 2n],
    ['+2', 2n, 1n],
    ['-0.5', -1n, 2n],
    ['  7.000 ', 7n, 1n],
  ])('reads %j as %d/%d in lowest terms', (text, n, d) => {
    const value = decimal(text);
    expect([value.n, value.d]).toEqual([n, d]);
  });

  it.each(['', '1e3', '1.2.3', 'abc', '1.', '0.' + '1'.repeat(19), '1'.repeat(61)])(
    'rejects %j',
    (text) => expect(() => decimal(text)).toThrow('Invalid decimal'),
  );

  it('rejects a non-positive denominator', () => {
    expect(() => new Decimal(1n, 0n)).toThrow('Invalid denominator');
  });
});

describe('Decimal arithmetic is exact', () => {
  it('adds 0.1 and 0.2 to exactly 0.3', () => {
    const value = decimal('0.1').add(decimal('0.2'));
    expect([value.n, value.d]).toEqual([3n, 10n]);
  });

  it('multiplies and divides without drift', () => {
    expect(decimal('1').div(decimal('3')).mul(decimal('3')).round(18)).toBe('1.000000000000000000');
    expect(decimal('10').div(decimal('-4')).round(2)).toBe('-2.50');
  });

  it('rejects division by zero', () => {
    expect(() => decimal('1').div(decimal('0'))).toThrow('Division by zero');
  });

  it('sums a list of strings', () => {
    expect(sum(['0.10', '0.20', '-0.05']).round(2)).toBe('0.25');
    expect(sum([]).round(2)).toBe('0.00');
  });
});

describe('Decimal rounding is half away from zero', () => {
  it.each([
    ['0.5', 0, '1'],
    ['-0.5', 0, '-1'],
    ['1.5', 0, '2'],
    ['2.5', 0, '3'],
    ['-2.5', 0, '-3'],
    ['0.49', 0, '0'],
    ['120.005', 2, '120.01'],
    ['-5.005', 2, '-5.01'],
    ['-0.004', 2, '0.00'],
    ['0.004', 2, '0.00'],
    ['3', 2, '3.00'],
    ['0.0625', 3, '0.063'],
    ['-1234.5', 0, '-1235'],
  ])('rounds %s to %d places as %s', (text, places, expected) => {
    expect(decimal(text).round(places)).toBe(expected);
  });
});

describe('nonnegative', () => {
  it('treats blank as zero only when allowed', () => {
    expect(nonnegative('  ', true).round(0)).toBe('0');
    expect(() => nonnegative('  ')).toThrow('Invalid decimal');
  });

  it('rejects negative input', () => {
    expect(() => nonnegative('-0.01')).toThrow('Negative input');
    expect(nonnegative('0').round(0)).toBe('0');
  });
});
