/**
 * Minor-unit digits per currency, owned by the app. Browsers disagree (Chrome formats HUF with no
 * decimals, Firefox and WebKit with two), and the digits decide both rounding and display, so the
 * app never asks `Intl` for them. The table lists every currency that is not 2 digits, matching
 * what Chrome (CLDR) reports, so existing estimates stay identical.
 */
const minorUnits: Readonly<Record<string, number>> = {
  AFN: 0,
  ALL: 0,
  BHD: 3,
  BIF: 0,
  CLP: 0,
  COP: 0,
  DJF: 0,
  GNF: 0,
  HUF: 0,
  IDR: 0,
  IQD: 0,
  IRR: 0,
  ISK: 0,
  JOD: 3,
  JPY: 0,
  KMF: 0,
  KPW: 0,
  KRW: 0,
  KWD: 3,
  LAK: 0,
  LBP: 0,
  LYD: 3,
  MGA: 0,
  MMK: 0,
  OMR: 3,
  PKR: 0,
  PYG: 0,
  RWF: 0,
  SLL: 0,
  SOS: 0,
  SYP: 0,
  TND: 3,
  UGX: 0,
  VND: 0,
  VUV: 0,
  XAF: 0,
  XOF: 0,
  XPF: 0,
  YER: 0,
};

/** Fraction digits of a currency code (`HUF` 0, `EUR` 2, `KWD` 3); unlisted codes use 2. */
export function currencyMinorUnits(currency: string) {
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error('Invalid currency');
  return Object.hasOwn(minorUnits, currency) ? minorUnits[currency]! : 2;
}
