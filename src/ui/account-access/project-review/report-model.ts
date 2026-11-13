import type { SavedProject } from '../../../platform/projects/types';
import type { PreviewSurface, ReportSettings } from '../../../platform/reports/types';
import { defaultSelection } from '../../../platform/reports/types';

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
