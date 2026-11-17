import type { EstimateSummary } from '../estimates/snapshots';
import { reportEstimate } from '../reports/estimate';
import type { FullEstimateScope } from '../reports/estimate';
import type { Draft } from '../reports/types';
import type { RecipientReport } from './types';

const areaUnits = { metric: 'm²', imperial: 'ft²' } as const;

/**
 * The export input for a recipient draft: the shared names and units of the surfaces kept, the
 * stored estimate level if any, and the recipient label on every file. No assessment values,
 * photos or branding are added, because the grant does not carry them.
 */
export function recipientExportDraft(report: RecipientReport): Draft {
  const { source, settings } = report;
  const surfaces = source.objects.flatMap((object, o) =>
    object.surfaces
      .map((surface, s) => ({
        id: `${o}/${s}`,
        name: surface.name,
        object: object.name,
        version: 'current',
        compare: '' as const,
        unit: areaUnits[surface.units],
        references: [],
      }))
      .filter(({ id }) => !settings.excluded.includes(id)),
  );
  const estimate =
    report.estimate && settings.finances !== 'none'
      ? reportEstimate(
          JSON.parse(report.estimate.text) as EstimateSummary | FullEstimateScope,
          settings.finances,
          source.revision,
        )
      : undefined;
  return {
    language: settings.language,
    content: { map: false, legend: false, table: false, detail: false },
    notes: settings.notes,
    format: settings.format,
    workbook: 'snapshot',
    project: {
      name: source.name,
      revision: source.revision,
      updatedAt: Date.parse(report.savedAt),
    },
    surfaces,
    ...(estimate ? { estimate } : {}),
    recipient: true,
  };
}
