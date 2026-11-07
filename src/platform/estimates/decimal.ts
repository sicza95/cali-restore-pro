// Exact rational decimal arithmetic. Only presentation rounds; money uses
// nearest minor unit, with exact ties away from zero (including discounts).
export class Decimal {
  constructor(
    readonly n: bigint,
    readonly d = 1n,
  ) {
    if (d <= 0n) throw new Error('Invalid denominator');
    let a = n < 0n ? -n : n,
      b = d;
    while (b) [a, b] = [b, a % b];
    this.n = n / a;
    this.d = d / a;
  }
  static from(text: string) {
    const value = text
      .trim()
      .replace(',', '.')
      .replace(/^([+-]?)\./, '$10.');
    if (!/^[+-]?\d+(?:\.\d{1,18})?$/.test(value) || value.length > 60)
      throw new Error('Invalid decimal');
    const [whole, fraction = ''] = value.split('.');
    const sign = value.startsWith('-') ? -1n : 1n;
    return new Decimal(
      BigInt(whole!) * 10n ** BigInt(fraction.length) + sign * BigInt(fraction || '0'),
      10n ** BigInt(fraction.length),
    );
  }
  add(b: Decimal) {
    return new Decimal(this.n * b.d + b.n * this.d, this.d * b.d);
  }
  mul(b: Decimal) {
    return new Decimal(this.n * b.n, this.d * b.d);
  }
  div(b: Decimal) {
    if (!b.n) throw new Error('Division by zero');
    return new Decimal(this.n * b.d * (b.n < 0n ? -1n : 1n), this.d * (b.n < 0n ? -b.n : b.n));
  }
  positive() {
    return this.n > 0n;
  }
  nonnegative() {
    return this.n >= 0n;
  }
  round(places: number) {
    const scale = 10n ** BigInt(places);
    const magnitude = (this.n < 0n ? -this.n : this.n) * scale;
    const rounded = magnitude / this.d + ((magnitude % this.d) * 2n >= this.d ? 1n : 0n);
    const digits = rounded.toString().padStart(places + 1, '0');
    return (
      (this.n < 0n && rounded ? '-' : '') +
      (places ? digits.slice(0, -places) + '.' + digits.slice(-places) : digits)
    );
  }
}
export const decimal = Decimal.from;
export const sum = (values: string[]) => values.reduce((a, b) => a.add(decimal(b)), decimal('0'));
export function nonnegative(value: string, empty = false) {
  const result = decimal(empty && !value.trim() ? '0' : value);
  if (!result.nonnegative()) throw new Error('Negative input');
  return result;
}
