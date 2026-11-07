import { test, expect } from '@playwright/test';
import { calculate, calculatePhase } from '../src/platform/estimates/calculate';
import { decimal } from '../src/platform/estimates/decimal';
import {
  areaChange,
  changeFactor,
  changeUnit,
  convertArea,
  receiveMeasurement,
} from '../src/platform/estimates/units';
import { snapshot, summary } from '../src/platform/estimates/snapshots';
import { parseEstimateScope } from '../src/platform/estimates/scopes';
import { applyPreset } from '../src/platform/estimates/persistence';
import { input, phase } from './fixtures';

test('phase oracle: independent effort, hourly/area/fixed and materials', () => {
  for (const factor of ['1', '2']) {
    const p = phase({ multiplier: factor });
    expect(calculatePhase(p, 2).hours).toBe(
      factor === '1' ? '5.000000000000000000' : '10.000000000000000000',
    );
    expect(calculatePhase(p, 2).work).toBe(factor === '1' ? '200.00' : '400.00');
    expect(calculatePhase({ ...p, price: 'area' }, 2).work).toBe('150.00');
    expect(calculatePhase({ ...p, price: 'fixed' }, 2).work).toBe('175.00');
    expect(calculatePhase(p, 2).material).toBe('30.00');
  }
  const p = phase({ mode: 'time', time: '10', multiplier: '2' });
  expect(calculatePhase(p, 2).productivity).toBe('1.000000000000000000');
  expect(calculatePhase(p, 2).baseline).toBe('2.000000000000000000');
  expect(changeFactor(p, '3', 'keep')).not.toHaveProperty('time');
  expect(changeFactor(p, '3', 'adjust').time).toBe('15');
  expect(changeFactor(p, '3', 'cancel')).toEqual({ factorDraft: undefined });
});

test('adjustments share the unadjusted base, tax is last and disabled rate is preserved', () => {
  const base = input({
    phases: [phase({ price: 'fixed', rate: { fixed: '1000' }, material: '' })],
    adjustments: [
      { id: 'plus', name: 'Contingency', percent: '10' },
      { id: 'minus', name: 'Discount', percent: '-5' },
    ],
    tax: { enabled: true, rate: '20' },
  });
  const a = calculate(base);
  expect(a.beforeTax).toBe('1050.00');
  expect(a.total).toBe('1260.00');
  expect(calculate({ ...base, adjustments: [...base.adjustments].reverse() }).total).toBe(a.total);
  expect(calculate({ ...base, tax: { enabled: false, rate: '20' } }).total).toBe('1050.00');
  expect(a.hours).toBe('5.000000000000000000');
});

test('round each component then adjustments then tax; ties away from zero', () => {
  const result = calculate(
    input({
      phases: [phase({ price: 'fixed', rate: { fixed: '1.006' }, material: '1.006' })],
      adjustments: [{ id: 'a', name: 'Allowance', percent: '10' }],
      tax: { enabled: true, rate: '20' },
    }),
  );
  expect(result.subtotal).toBe('2.02');
  expect(result.adjustments[0]!.amount).toBe('0.20');
  expect(result.beforeTax).toBe('2.22');
  expect(result.taxTotal).toBe('0.44');
  expect(result.total).toBe('2.66');
  expect(decimal('1.005').round(2)).toBe('1.01');
  expect(decimal('-1.005').round(2)).toBe('-1.01');
  expect(decimal('2.5').round(0)).toBe('3');
  expect(decimal('0.0005').round(3)).toBe('0.001');
});

test('unit normalization and physical change detection do not invent display changes', () => {
  expect(convertArea('1', 'ft²', 'cm²').round(8)).toBe('929.03040000');
  const q = phase().quantity!;
  expect(areaChange(q, { ...q, area: '0.001', unit: 'm²' }, 'time')).toBe('none');
  expect(areaChange(q, { ...q, area: '20' }, 'time')).toBe('review-hours');
  expect(areaChange(q, { ...q, area: '20' }, 'productivity')).toBe('recalculate');
  const p = phase();
  expect(calculatePhase({ ...p, ...changeUnit(p, 'm²') }, 2).work).toBe('200.00');
  const changed = {
    ...p,
    mode: 'time' as const,
    ...receiveMeasurement({ ...p, mode: 'time' }, { ...q, area: '20' }),
  };
  expect(changed.time).toBe('10');
  expect(changed.measurement).toBe('stale');
  expect(calculatePhase(phase({ quantity: { ...q, area: '0.001', unit: 'm²' } }), 2).work).toBe(
    '200.00',
  );
});

test('zero is valid, unavailable is not zero; manual inputs survive', () => {
  const q = phase().quantity!;
  expect(calculatePhase(phase({ quantity: { ...q, area: '0' } }), 2).work).toBe('0.00');
  expect(
    calculatePhase(phase({ quantity: { ...q, area: '0' }, mode: 'time', time: '0' }), 2)
      .productivity,
  ).toBeNull();
  for (const validity of ['missing', 'stale', 'computing', 'failed'] as const) {
    const p = phase({ quantity: { ...q, validity } });
    expect(calculatePhase(p, 2).work).toBeNull();
    expect(calculatePhase({ ...p, mode: 'time', time: '10' }, 2).work).toBe('400.00');
    expect(calculatePhase({ ...p, price: 'fixed' }, 2).work).toBe('175.00');
  }
  expect(calculatePhase(phase({ quantity: { ...q, calibration: null } }), 2).work).toBeNull();
  expect(calculatePhase(phase({ quantity: { ...q, scope: 'wrong-mask' } }), 2).work).toBeNull();
  for (const value of ['', 'NaN', 'Infinity', '1e3', '-1', '0'])
    expect(() => calculatePhase(phase({ multiplier: value }), 2)).toThrow();
});

test('selection includes object contributions and project extras once without prorating', () => {
  const result = calculate(
    input({
      extras: [
        {
          id: 'rental',
          name: 'Rental cost only',
          object: '',
          method: 'fixed',
          hours: '',
          rate: { fixed: '100' },
          included: true,
        },
        {
          id: 'travel',
          name: 'Travel',
          object: 'object-a',
          method: 'hourly',
          hours: '2',
          rate: { hourly: '10' },
          included: true,
        },
        {
          id: 'excluded',
          name: 'Excluded',
          object: 'object-b',
          method: 'fixed',
          hours: '99',
          rate: { fixed: '999' },
          included: true,
        },
      ],
    }),
  );
  expect(result.subtotal).toBe('350.00');
  expect(result.extras).toBe('100.00');
  expect(result.hours).toBe('7.000000000000000000');
  expect(result.objects).toHaveLength(1);
});

test('snapshot is detached and summary is an allowlisted stale projection, not a recomputation', () => {
  const draft = input();
  const issued = snapshot(draft, 1, true);
  draft.phases[0]!.rate.hourly = '999';
  expect(issued.result.total).toBe('230.00');
  expect(issued.input.phases[0]!.rate.hourly).toBe('40');
  const projection = summary(issued, 2);
  expect(projection.freshness).toBe('stale');
  const text = JSON.stringify(projection);
  for (const secret of ['hours', 'material', 'productivity', 'rate', 'Private access', 'Cleaning'])
    expect(text).not.toContain(secret);
  expect(parseEstimateScope('estimate-summary', text)).toEqual([text]);
  expect(() =>
    parseEstimateScope('estimate-summary', JSON.stringify({ ...projection, hours: '5' })),
  ).toThrow();
  expect(() => calculate(input({ currency: 'USD' }))).toThrow('Repricing');
  expect(issued.input.currency).toBe('EUR');
  expect(
    parseEstimateScope(
      'estimate-full',
      JSON.stringify({ schema: 1, scope: 'estimate-full', snapshot: issued }),
    ),
  ).toHaveLength(1);
});

test('preset values and versions are copied, never linked to later library edits', () => {
  const preset = {
    id: 'private',
    version: 2,
    name: 'Cleaning',
    kind: 'rate' as const,
    value: '60',
    unit: 'hourly' as const,
    currency: 'EUR',
    archived: false,
  };
  const copied = applyPreset(phase(), preset, 'EUR');
  preset.value = '999';
  expect(copied.rate!.hourly).toBe('60');
  expect(copied.presets).toEqual([{ id: 'private', version: 2 }]);
  expect(() => applyPreset(phase(), preset, 'USD')).toThrow();
});
