import { input } from '../../tests-estimates/fixtures';
import { snapshot } from '../../src/platform/estimates/snapshots';
import type { ReportDraft } from '../../src/platform/reports/types';

export function backupRecords(project: string, photo = '') {
  const draft = input({ project, revision: 7, assumptions: 'Private backup assumptions' });
  draft.phases[0]!.quantity!.project = project;
  draft.phases[0]!.scopeSource = photo;
  const issued = snapshot(draft, 1, true);
  const estimate = { schema: 1 as const, draft, snapshots: [issued] };
  const report: ReportDraft = {
    schema: 1,
    project,
    projectRevision: 7,
    savedAt: '2026-11-01T12:00:00.000Z',
    settings: {
      language: 'hu',
      unit: 'cm²',
      excluded: ['surface-b'],
      surfaces: {
        'surface-a': {
          included: true,
          version: 'checkpoint-a',
          compare: 'current',
          references: photo ? [photo] : [],
        },
      },
      content: { map: true, legend: true, table: true, detail: true },
      notes: 'Private report notes',
      finances: 'full',
      estimate: issued.id,
      brandingSource: 'override',
      branding: {
        studio: 'Studio',
        contact: 'Contact',
        footer: 'Footer',
        accent: '#112233',
        logo: '',
      },
      format: 'XLSX',
      resolution: '600',
      workbook: 'editable',
    },
  };
  return { estimate, report };
}
