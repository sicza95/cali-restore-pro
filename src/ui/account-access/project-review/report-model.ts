import type { ReportEstimate } from '../../../platform/reports/estimate';
import type { AreaUnit } from '../../../platform/estimates/types';
import type { SavedProject } from '../../../platform/projects/types';
import type { ReportSettings, Selection, Version } from '../../../platform/reports/types';
import { defaultSelection } from '../../../platform/reports/types';

export type PreviewSurface = {
  id: string;
  name: string;
  object: string;
  version: Version;
  compare: Selection['compare'];
  unit: AreaUnit;
  references: number[];
};

export type Draft = Pick<
  ReportSettings,
  'language' | 'content' | 'notes' | 'branding' | 'format'
> & {
  project: Pick<SavedProject, 'name' | 'revision' | 'updatedAt'>;
  surfaces: PreviewSurface[];
  estimate?: ReportEstimate;
  estimateState?: 'unavailable' | 'outsideScope';
  resolution?: ReportSettings['resolution'];
  workbook?: ReportSettings['workbook'];
};

export function selectedSurfaces(
  project: SavedProject,
  settings: ReportSettings,
): PreviewSurface[] {
  return project.objects
    .filter((object) => !settings.excluded.includes(object.id))
    .flatMap((object) =>
      object.surfaces.flatMap((surface) => {
        const scope = settings.surfaces[surface.id] ?? defaultSelection;
        if (!scope.included) return [];
        const inherited = surface.units ?? object.units ?? project.settings.units;
        return [
          {
            id: surface.id,
            name: surface.name,
            object: object.name,
            version: scope.version,
            compare: scope.compare,
            unit:
              settings.unit === 'inherited'
                ? inherited === 'imperial'
                  ? 'ft²'
                  : 'm²'
                : settings.unit,
            references: surface.images
              .filter(({ role }) => role === 'reference')
              .flatMap(({ id }, index) => (scope.references.includes(id) ? [index + 1] : [])),
          },
        ];
      }),
    );
}
