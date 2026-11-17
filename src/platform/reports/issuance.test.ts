import { describe, expect, it } from 'vitest';
import { input, phase } from '../../../tests-estimates/fixtures';
import { snapshot } from '../estimates/snapshots';
import { restoreDocuments } from '../vault/backup-documents';
import { reportEstimate } from './estimate';
import { reportBlocks, reportTable } from './export-rows';
import { estimateSheets } from './export-editable';
import { workbookEstimate } from './workbook-estimate';
import { assertReportIssuance, finalReportBlock, issueReport } from './issuance';
import { reportCopy } from './copy';
import type { Draft, PreviewSurface } from './types';

const surfaces: PreviewSurface[] = [
  {
    id: 'surface-a',
    name: 'Surface',
    object: 'Object',
    version: 'current',
    compare: '',
    unit: 'm²',
    references: [],
  },
];
const issued = () => snapshot(input(), 3, true);
function report(source = issued()): Draft {
  return {
    project: { name: 'Project', revision: 2, updatedAt: 0 },
    surfaces,
    language: 'en',
    notes: '',
    format: 'XLSX',
    content: { map: false, legend: false, table: true, detail: true },
    estimate: reportEstimate({ scope: 'estimate-full', snapshot: source }, 'full', 2),
  };
}

describe('final report issuance', () => {
  it('requires an included, issued, complete estimate and at least one surface', () => {
    const source = issued();
    expect(finalReportBlock(source, surfaces, 'full')).toBeUndefined();
    expect(finalReportBlock(source, surfaces, 'none')).toBe('finalNoEstimate');
    expect(finalReportBlock(undefined, surfaces, 'summary')).toBe('finalNoEstimate');
    expect(finalReportBlock(source, [], 'full')).toBe('finalNoSurfaces');
    expect(finalReportBlock({ ...source, issued: false }, surfaces, 'full')).toBe('finalUnissued');
    expect(() => issueReport(report(), { ...source, issued: false })).toThrow();
  });

  it('rejects partial totals even with an issued flag, including numeric totals awaiting review', () => {
    for (const result of [
      { ...issued().result, complete: false },
      { ...issued().result, complete: true, total: null },
    ]) {
      const source = { ...issued(), result };
      expect(finalReportBlock(source, surfaces, 'full')).toBe('finalIncomplete');
      expect(() => issueReport(report(source), source)).toThrow();
    }
    const partial = snapshot(
      input({ phases: [phase({ measurement: 'missing', quantity: undefined, price: 'area' })] }),
      1,
      false,
    );
    expect(report(partial).estimate?.draft).toBe(true);
    expect(() => issueReport(report(partial), partial)).toThrow();
  });

  it('requires all quoted surfaces and measured assessment versions', () => {
    const source = issued();
    source.input.phases[0]!.quantity!.source = 'committed';
    source.input.phases[0]!.quantity!.assessment = 'checkpoint';
    expect(finalReportBlock(source, surfaces, 'full')).toBe('finalOutsideScope');
    expect(
      finalReportBlock(source, [{ ...surfaces[0]!, compare: 'checkpoint' }], 'full'),
    ).toBeUndefined();
    expect(finalReportBlock(source, [{ ...surfaces[0]!, id: 'other' }], 'full')).toBe(
      'finalOutsideScope',
    );
  });

  it.each(['en', 'hu'] as const)(
    'records historical issued provenance and labels final and draft outputs in %s',
    (language) => {
      const source = issued();
      const output = { ...report(source), language };
      const c = reportCopy[language];
      expect(output.estimate?.summary.freshness).toBe('stale');
      expect(reportTable(output)[0]).toContain(c.exportNote);
      output.issuance = issueReport(output, source);
      expect(output.issuance.estimate).toEqual({
        id: source.id,
        version: 3,
        createdAt: source.createdAt,
      });
      expect(() => assertReportIssuance(output)).not.toThrow();
      expect(reportTable(output)[0]).toContain(c.finalExportNote);
      expect(reportBlocks(output)[0]!.rows).toContainEqual([c.title, c.finalSource, 3]);
      expect(estimateSheets(output, workbookEstimate(source, surfaces))[0]!.rows[0]).toContain(
        c.finalExportNote,
      );
      expect(() =>
        assertReportIssuance({ ...output, estimate: { ...output.estimate!, complete: false } }),
      ).toThrow();
      expect(() =>
        assertReportIssuance({
          ...output,
          issuance: { ...output.issuance!, estimate: { ...output.issuance!.estimate, version: 4 } },
        }),
      ).toThrow();
    },
  );

  it('does not carry a final issuance into a restored project copy', () => {
    const source = issued();
    const output = report(source);
    const restored = restoreDocuments(
      {
        report: JSON.stringify({
          schema: 1,
          project: 'old',
          projectRevision: 1,
          settings: { surfaces: {} },
          issuance: issueReport(output, source),
        }),
      },
      'old',
      'new',
      new Map(),
      1,
    );
    expect(JSON.parse(restored.report!).issuance).toBeUndefined();
  });
});
