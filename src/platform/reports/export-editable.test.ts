import { describe, expect, it } from 'vitest';
import { estimateSheets } from './export-editable';
import type { Draft } from './types';
import type { WorkbookEstimate } from './workbook-estimate';

// Sheet names and headings follow the draft's language, not the app's.
const estimate = {
  currency: 'HUF',
  precision: 2,
  assumptions: '',
  tax: 0,
  objects: [],
  phases: [],
  extras: [],
  adjustments: [],
  result: {},
} as unknown as WorkbookEstimate;
const sheets = (language: Draft['language']) => estimateSheets({ language } as Draft, estimate);

describe('editable estimate workbook', () => {
  it('names sheets and headings in English', () => {
    const [results, phases, extras, adjustments] = sheets('en');
    expect([phases!.name, extras!.name, adjustments!.name, results!.name]).toEqual([
      'Work phases',
      'Extras',
      'Adjustments',
      'Estimate',
    ]);
    expect(phases!.rows[0]!.slice(0, 4)).toEqual(['Object #', 'Object', 'Surface', 'Phase']);
    expect(phases!.rows[0]).toContain('Baseline productivity');
  });

  it('names sheets and headings in Hungarian', () => {
    const [results, phases, extras, adjustments] = sheets('hu');
    expect([phases!.name, extras!.name, adjustments!.name, results!.name]).toEqual([
      'Munkafázisok',
      'Kiegészítő tételek',
      'Korrekciók',
      'Becslés',
    ]);
    expect(phases!.rows[0]!.slice(0, 2)).toEqual(['Tárgy #', 'Tárgy']);
    expect(phases!.rows[0]![3]).toBe('Munkafázis');
    expect(phases!.rows[0]).toContain('Alap termelékenység');
  });
});
