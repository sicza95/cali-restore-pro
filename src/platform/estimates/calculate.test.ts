import { describe, expect, it } from 'vitest';
import { calculate, calculatePhase, currencyPrecision } from './calculate';
import type { EstimateInput, Extra, Measurement, Phase } from './types';

// Every expected value below is worked out by hand in the comment beside it.
const project = 'project-1';
const object = 'object-1';

const measurement = (area: string | null, overrides: Partial<Measurement> = {}): Measurement => ({
  version: 1,
  project,
  object,
  surface: 'surface-1',
  phase: 'phase-1',
  scope: 'scope-1',
  revision: '3/source/1/1',
  calibration: '1',
  source: 'committed',
  validity: area === null ? 'missing' : 'valid',
  area,
  unit: 'm²',
  ...overrides,
});

const phase = (overrides: Partial<Phase> = {}): Phase => ({
  id: 'phase-1',
  name: 'Cleaning',
  archived: false,
  surface: 'surface-1',
  scope: 'scope-1',
  measurement: 'ready',
  quantity: measurement('12.5'),
  mode: 'time',
  time: '10',
  productivity: {},
  multiplier: '1',
  price: 'hourly',
  rate: { hourly: '45.50' },
  material: '120.005',
  units: 'm²',
  ...overrides,
});

const extra = (overrides: Partial<Extra> = {}): Extra => ({
  id: 'extra-1',
  name: 'Travel',
  object: '',
  method: 'fixed',
  hours: '',
  rate: { fixed: '30' },
  included: true,
  ...overrides,
});

const input = (overrides: Partial<EstimateInput> = {}): EstimateInput => ({
  schema: 1,
  project,
  revision: 3,
  currency: 'EUR',
  priceCurrency: 'EUR',
  objects: [{ id: object, name: 'Altarpiece', surfaces: ['surface-1'] }],
  selected: [object],
  phases: [phase()],
  extras: [],
  adjustments: [],
  tax: { enabled: false, rate: '0' },
  assumptions: '',
  ...overrides,
});

describe('currencyPrecision', () => {
  it.each([
    ['EUR', 2],
    ['HUF', 0],
    ['JPY', 0],
    ['KWD', 3],
  ])('%s has %d minor digits', (currency, digits) => {
    expect(currencyPrecision(currency)).toBe(digits);
  });

  it('rejects a malformed code', () => {
    expect(() => currencyPrecision('eur')).toThrow('Invalid currency');
  });
});

describe('calculatePhase', () => {
  it('prices hours in time mode and rounds material half away from zero', () => {
    // 10 h × 45.50 = 455.00; material 120.005 → 120.01; 12.5 m² / 10 h = 1.25 m²/h.
    expect(calculatePhase(phase(), 2, project, object)).toEqual({
      id: 'phase-1',
      hours: '10.000000000000000000',
      productivity: '1.250000000000000000',
      baseline: '1.250000000000000000',
      work: '455.00',
      material: '120.01',
      subtotal: '575.01',
      issues: [],
    });
  });

  it('applies the factor to hours in productivity mode, in converted units', () => {
    // 9.290304 m² = 100 ft². 100 ft² / 20 ft²/h × 1.5 = 7.5 h.
    // Area price 100 ft² × 350 = 35000; HUF rounds material 1234.5 → 1235.
    const result = calculatePhase(
      phase({
        quantity: measurement('9.290304'),
        units: 'ft²',
        mode: 'productivity',
        productivity: { 'ft²': '20' },
        multiplier: '1.5',
        price: 'area',
        rate: { 'ft²': '350' },
        material: '1234.5',
      }),
      0,
    );
    expect(result).toMatchObject({
      hours: '7.500000000000000000',
      // Effective speed 20 / 1.5 = 13.3…
      productivity: '13.333333333333333333',
      baseline: '20.000000000000000000',
      work: '35000',
      material: '1235',
      subtotal: '36235',
    });
  });

  it('uses the fixed rate regardless of hours', () => {
    const result = calculatePhase(phase({ price: 'fixed', rate: { fixed: '99.999' } }), 2);
    // 99.999 → 100.00; plus material 120.01.
    expect(result).toMatchObject({ work: '100.00', subtotal: '220.01' });
  });

  it('flags a missing area and leaves an area price unpriced', () => {
    const result = calculatePhase(
      phase({ quantity: measurement(null), price: 'area', rate: { 'm²': '10' } }),
      2,
    );
    expect(result).toMatchObject({
      hours: '10.000000000000000000',
      productivity: null,
      work: null,
      subtotal: null,
      issues: ['area-unavailable'],
    });
  });

  it.each([
    ['another project', { project: 'project-2' }],
    ['another phase', { phase: 'phase-2' }],
    ['another scope', { scope: 'scope-2' }],
    ['no calibration', { calibration: null }],
    ['a stale value', { validity: 'stale' as const }],
  ])('ignores a measurement from %s', (_label, overrides) => {
    const result = calculatePhase(phase({ quantity: measurement('12.5', overrides) }), 2, project);
    expect(result.issues).toEqual(['area-unavailable']);
    expect(result.productivity).toBeNull();
  });

  it('asks for review when the measurement changed under fixed hours', () => {
    expect(calculatePhase(phase({ measurement: 'stale' }), 2).issues).toEqual(['review-hours']);
  });

  it.each([
    ['an unresolved factor', { factorDraft: '2' }, 'Resolve factor'],
    ['a zero factor', { multiplier: '0' }, 'Resolve factor'],
    ['a blank name', { name: '  ' }, 'Incomplete phase'],
    ['negative material', { material: '-1' }, 'Negative input'],
    ['negative hours', { time: '-1' }, 'Negative input'],
    ['a missing rate', { rate: {} }, 'Invalid decimal'],
    [
      'zero productivity',
      { mode: 'productivity' as const, productivity: { 'm²': '0' } },
      'Invalid productivity',
    ],
  ])('rejects %s', (_label, overrides, message) => {
    expect(() => calculatePhase(phase(overrides), 2)).toThrow(message);
  });
});

describe('calculate', () => {
  it('totals phases, project extras, a discount and tax', () => {
    // Object 575.01 + travel 30.00 = 605.01.
    // Discount −10 %: −60.501 → −60.50. Before tax 544.51.
    // Tax 27 %: 147.0177 → 147.02. Total 691.53.
    const result = calculate(
      input({
        extras: [extra()],
        adjustments: [{ id: 'discount', name: 'Discount', percent: '-10' }],
        tax: { enabled: true, rate: '27' },
      }),
    );
    expect(result).toEqual({
      calculation: 'restoration-v1',
      rounding: 'half-away-from-zero',
      precision: 2,
      complete: true,
      illustrative: false,
      phases: [expect.objectContaining({ id: 'phase-1', subtotal: '575.01' })],
      objects: [{ id: object, name: 'Altarpiece', subtotal: '575.01' }],
      extras: '30.00',
      adjustments: [{ id: 'discount', amount: '-60.50' }],
      hours: '10.000000000000000000',
      subtotal: '605.01',
      beforeTax: '544.51',
      taxTotal: '147.02',
      total: '691.53',
      issues: [],
    });
  });

  it('rounds a negative discount tie away from zero', () => {
    // Fixed work 100.10, no material. −5 % = −5.005 → −5.01. Total 95.09.
    const result = calculate(
      input({
        phases: [phase({ price: 'fixed', rate: { fixed: '100.10' }, material: '' })],
        adjustments: [{ id: 'a', name: 'Loyalty', percent: '-5' }],
      }),
    );
    expect(result).toMatchObject({
      adjustments: [{ id: 'a', amount: '-5.01' }],
      beforeTax: '95.09',
      taxTotal: '0.00',
      total: '95.09',
    });
  });

  it('adds hourly object extras to their object and their hours to the total', () => {
    // Extra 2.5 h × 40 = 100.00 on the object; object 575.01 + 100.00 = 675.01.
    const result = calculate(
      input({
        extras: [extra({ object, method: 'hourly', hours: '2.5', rate: { hourly: '40' } })],
      }),
    );
    expect(result).toMatchObject({
      objects: [{ subtotal: '675.01' }],
      extras: '0.00',
      subtotal: '675.01',
      hours: '12.500000000000000000',
      total: '675.01',
    });
  });

  it('leaves out archived phases, excluded extras and unselected objects', () => {
    const result = calculate(
      input({
        objects: [
          { id: object, name: 'Altarpiece', surfaces: ['surface-1'] },
          { id: 'object-2', name: 'Frame', surfaces: ['surface-2'] },
        ],
        phases: [phase(), phase({ id: 'phase-2', surface: 'surface-2', rate: { hourly: '1' } })],
        extras: [extra({ included: false }), extra({ id: 'extra-2', object: 'object-2' })],
      }),
    );
    expect(result.phases.map((p) => p.id)).toEqual(['phase-1']);
    expect(result.total).toBe('575.01');

    const archived = calculate(input({ phases: [phase({ archived: true })], extras: [extra()] }));
    expect(archived).toMatchObject({ phases: [], hours: '0.000000000000000000', total: '30.00' });
  });

  it('has no totals while a phase is unpriced', () => {
    const result = calculate(
      input({
        phases: [phase({ quantity: measurement(null), price: 'area', rate: { 'm²': '10' } })],
        adjustments: [{ id: 'a', name: 'Discount', percent: '-10' }],
        tax: { enabled: true, rate: '27' },
      }),
    );
    expect(result).toMatchObject({
      complete: false,
      objects: [{ subtotal: null }],
      subtotal: null,
      adjustments: [{ id: 'a', amount: '0' }],
      beforeTax: null,
      taxTotal: null,
      total: null,
      issues: ['area-unavailable'],
    });
  });

  it('totals but is not complete while hours need review', () => {
    const result = calculate(input({ phases: [phase({ measurement: 'stale' })] }));
    expect(result).toMatchObject({ total: '575.01', complete: false });
  });

  it('marks fixture measurements as illustrative', () => {
    const result = calculate(
      input({ phases: [phase({ quantity: measurement('12.5', { source: 'fixture' }) })] }),
    );
    expect(result.illustrative).toBe(true);
  });

  it('rounds each stage to the currency, here HUF', () => {
    // 3 h × 3333.5 = 10000.5 → 10001; material 0. Tax 27 %: 2700.27 → 2700. Total 12701.
    const result = calculate(
      input({
        currency: 'HUF',
        priceCurrency: 'HUF',
        phases: [phase({ time: '3', rate: { hourly: '3333.5' }, material: '' })],
        tax: { enabled: true, rate: '27' },
      }),
    );
    expect(result).toMatchObject({
      precision: 0,
      subtotal: '10001',
      taxTotal: '2700',
      total: '12701',
    });
  });

  it.each([
    ['a currency change', { priceCurrency: 'HUF' }, 'Repricing required'],
    ['an empty selection', { selected: [] }, 'Invalid selection'],
    ['a duplicate selection', { selected: [object, object] }, 'Invalid selection'],
    ['an unknown object', { selected: ['object-9'] }, 'Invalid selection'],
    ['nothing to price', { phases: [] }, 'Empty estimate'],
    ['tax above 100 %', { tax: { enabled: true, rate: '100.01' } }, 'Invalid tax'],
    ['negative tax', { tax: { enabled: true, rate: '-1' } }, 'Negative input'],
    [
      'an adjustment above 100 %',
      { adjustments: [{ id: 'a', name: 'Surcharge', percent: '101' }] },
      'Invalid percentage',
    ],
    [
      'an unnamed adjustment',
      { adjustments: [{ id: 'a', name: ' ', percent: '5' }] },
      'Invalid adjustment',
    ],
    ['an unnamed extra', { extras: [extra({ name: '' })] }, 'Invalid extra'],
  ])('rejects %s', (_label, overrides: Partial<EstimateInput>, message) => {
    expect(() => calculate(input(overrides))).toThrow(message);
  });

  it('ignores the tax rate while tax is off', () => {
    expect(calculate(input({ tax: { enabled: false, rate: '500' } })).total).toBe('575.01');
  });
});
