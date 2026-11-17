import { describe, expect, it } from 'vitest';
import { snapshot } from '../estimates/snapshots';
import type { EstimateInput } from '../estimates/types';
import { reportEstimate } from './estimate';
import { workbookEstimate } from './workbook-estimate';
import { estimateSheets } from './export-editable';
import { reportBlocks } from './export-rows';
import type { Draft, PreviewSurface } from './types';

const input: EstimateInput = {
  schema: 1,
  project: 'p',
  revision: 1,
  currency: 'EUR',
  priceCurrency: 'EUR',
  objects: [{ id: 'o', name: 'Object', surfaces: ['s'] }],
  selected: ['o'],
  phases: [
    {
      id: 'x',
      name: 'Partial',
      archived: false,
      surface: 's',
      scope: '',
      measurement: 'missing',
      mode: 'time',
      time: '3',
      productivity: {},
      multiplier: '1',
      price: 'area',
      rate: { 'm²': '10' },
      material: '7',
      units: 'm²',
    },
  ],
  extras: [],
  adjustments: [{ id: 'a', name: 'Adjustment', percent: '5' }],
  tax: { enabled: false, rate: '' },
  assumptions: '',
};
const surface: PreviewSurface = {
  id: 's',
  name: 'Surface',
  object: 'Object',
  version: 'current',
  compare: '',
  unit: 'm²',
  references: [],
};

describe('saved incomplete estimate outputs', () => {
  it.each(['en', 'hu'] as const)(
    'retains unavailable values and draft provenance in %s',
    (language) => {
      const saved = snapshot(input, 1, false);
      expect(() => snapshot(input, 1, true)).toThrow('Incomplete estimate');
      const estimate = reportEstimate({ scope: 'estimate-full', snapshot: saved }, 'full', 1);
      expect(estimate.draft).toBe(true);
      expect(estimate.summary.total).toBeNull();
      expect(estimate.summary.adjustments[0]!.amount).toBeNull();
      expect(estimate.detail!.phases[0]).toMatchObject({
        hours: '3.000000000000000000',
        material: '7.00',
        work: null,
        subtotal: null,
      });
      const workbook = workbookEstimate(saved, [surface]);
      expect(workbook.phases[0]).toMatchObject({
        area: null,
        time: 3,
        rate: 10,
        material: 7,
        work: null,
      });
      const draft = {
        language,
        estimate,
        surfaces: [surface],
        project: { name: 'Project', revision: 1, updatedAt: 0 },
        content: { map: false, legend: false, table: true, detail: true },
        notes: '',
        format: 'XLSX',
      } as Draft;
      const marker = { en: 'Draft estimate (not issued)', hu: 'Becsléspiszkozat (nem kiadott)' }[
        language
      ];
      expect(
        reportBlocks(draft)
          .flatMap((block) => block.rows)
          .some((row) => row.includes(marker)),
      ).toBe(true);
      const sheets = estimateSheets(draft, workbook);
      expect(sheets[0]!.rows[0]).toContain(marker);
      expect(sheets[1]!.rows[1]![5]).toBeNull();
      expect(sheets[0]!.rows[5]![1]).toMatchObject({ cache: null });
    },
  );
});
