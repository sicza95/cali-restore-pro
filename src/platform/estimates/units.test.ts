import { describe, expect, it } from 'vitest';
import { areaChange, changeFactor, changeUnit, convertArea, receiveMeasurement } from './units';
import type { AreaUnit, Measurement, Phase } from './types';

const measurement = (area: string | null, unit: AreaUnit = 'm²'): Measurement => ({
  version: 1,
  project: 'p',
  object: 'o',
  surface: 's',
  phase: 'f',
  scope: 'c',
  revision: '1/x/1/1',
  calibration: '1',
  source: 'committed',
  validity: area === null ? 'missing' : 'valid',
  area,
  unit,
});

const phase = (overrides: Partial<Phase> = {}): Phase => ({
  id: 'f',
  name: 'Consolidation',
  archived: false,
  surface: 's',
  scope: 'c',
  measurement: 'ready',
  mode: 'time',
  time: '8',
  productivity: {},
  multiplier: '1',
  price: 'area',
  rate: {},
  material: '',
  units: 'm²',
  ...overrides,
});

describe('convertArea', () => {
  it.each([
    ['1', 'm²', 'cm²', '10000'],
    ['144', 'in²', 'ft²', '1'],
    ['1', 'ft²', 'in²', '144'],
    ['9.290304', 'm²', 'ft²', '100'],
    ['2500', 'cm²', 'm²', '0.25'],
  ] as const)('%s %s is %s %s', (value, from, to, expected) => {
    expect(convertArea(value, from, to).round(6)).toBe(Number(expected).toFixed(6));
  });

  it('rejects an unknown unit', () => {
    expect(() => convertArea('1', 'm²', 'yd²' as AreaUnit)).toThrow('Incompatible area unit');
  });
});

describe('changeFactor', () => {
  it('scales fixed hours when asked to adjust', () => {
    // 8 h at factor 1 → factor 2.5 → 20 h.
    expect(changeFactor(phase(), '2.5', 'adjust')).toEqual({
      multiplier: '2.5',
      factorDraft: undefined,
      time: '20',
    });
  });

  it('keeps hours when asked to keep, and only clears the draft on cancel', () => {
    expect(changeFactor(phase(), '2.5', 'keep')).toEqual({
      multiplier: '2.5',
      factorDraft: undefined,
    });
    expect(changeFactor(phase(), '2.5', 'cancel')).toEqual({ factorDraft: undefined });
  });

  it('rejects a zero factor', () => {
    expect(() => changeFactor(phase(), '0', 'keep')).toThrow('Invalid factor');
  });
});

describe('areaChange', () => {
  it('sees the same area in another unit as unchanged', () => {
    expect(areaChange(measurement('1'), measurement('10000', 'cm²'), 'time')).toBe('none');
  });

  it('asks for review of fixed hours, and recalculation of productivity', () => {
    expect(areaChange(measurement('1'), measurement('1.01'), 'time')).toBe('review-hours');
    expect(areaChange(measurement('1'), measurement('1.01'), 'productivity')).toBe('recalculate');
  });

  it('reports a first or missing measurement', () => {
    expect(areaChange(undefined, measurement('1'), 'time')).toBe('none');
    expect(areaChange(measurement('1'), measurement(null), 'time')).toBe('unavailable');
  });
});

describe('receiveMeasurement', () => {
  it('marks fixed hours stale when the area moves', () => {
    const update = receiveMeasurement(phase({ quantity: measurement('2') }), measurement('3'));
    expect(update).toEqual({ quantity: measurement('3'), measurement: 'stale' });
  });

  it('is ready on an unchanged area and missing on an invalid one', () => {
    const base = phase({ quantity: measurement('2') });
    expect(receiveMeasurement(base, measurement('2')).measurement).toBe('ready');
    expect(receiveMeasurement(base, measurement(null)).measurement).toBe('missing');
  });
});

describe('changeUnit', () => {
  it('converts the speed and per-area rate into the new unit', () => {
    // 1 m²/h = 10000 cm²/h; 50 per m² = 0.005 per cm².
    const update = changeUnit(phase({ productivity: { 'm²': '1' }, rate: { 'm²': '50' } }), 'cm²');
    expect(update).toEqual({
      units: 'cm²',
      productivity: { 'm²': '1', 'cm²': '10000' },
      rate: { 'm²': '50', 'cm²': '0.005' },
    });
  });

  it('leaves blank values alone', () => {
    const update = changeUnit(phase({ productivity: { 'm²': ' ' } }), 'ft²');
    expect(update).toEqual({ units: 'ft²', productivity: { 'm²': ' ' }, rate: {} });
  });
});
