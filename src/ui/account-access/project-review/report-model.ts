import type { SavedProject, Surface } from '../../../platform/projects/types';
import type { PreviewSurface, ReportSettings } from '../../../platform/reports/types';
import { defaultSelection } from '../../../platform/reports/types';
import { assessmentVersions } from '../../../platform/projects/assessment-selection';
import { prepareAssessment } from '../../../platform/reports/prepare-assessment';
import { referencePhoto } from '../../../platform/reports/reference-photos';
import type { LocalVault } from '../../../platform/vault/vault';

export function surfaceSelection(surface: Surface, settings: ReportSettings['surfaces']) {
  const scope = settings[surface.id] ?? defaultSelection;
  const versions = assessmentVersions(surface);
  // Auto-migrate the two old sample selectors. Preserve a real missing checkpoint
  // in the selection, so a deleted checkpoint can never silently become current.
  const version = ['baseline', 'followup'].includes(scope.version) ? 'current' : scope.version;
  const compare = ['baseline', 'followup', version].includes(scope.compare) ? '' : scope.compare;
  return { ...scope, version, compare, versions };
}

export function selectedSurfaces(
  project: SavedProject,
  settings: ReportSettings,
): PreviewSurface[] {
  return project.objects
    .filter((object) => !settings.excluded.includes(object.id))
    .flatMap((object) =>
      object.surfaces.flatMap((surface) => {
        const scope = surfaceSelection(surface, settings.surfaces);
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

export async function prepareSurfaces(
  project: SavedProject,
  selection: ReportSettings,
  surfaces: PreviewSurface[],
  vault: LocalVault,
  signal: AbortSignal,
) {
  const visual = ['SVG', 'PDF', 'PNG'].includes(selection.format);
  const count = surfaces.reduce((total, surface) => total + surface.references.length, 0);
  if (surfaces.length > 150 || count > (visual ? 24 : 2000)) throw new Error('Report size limit');
  const records = new Map(
    project.objects.flatMap(({ surfaces }) => surfaces.map((surface) => [surface.id, surface])),
  );
  for (const output of surfaces) {
    const surface = records.get(output.id)!;
    output.assessments = [];
    for (const version of [output.version, output.compare]) {
      if (version)
        output.assessments.push(
          await prepareAssessment(surface, version, project.revision, selection, signal),
        );
    }
    if (!visual) continue;
    const references = surface.images.filter(({ role }) => role === 'reference');
    output.photos = [];
    for (const ordinal of output.references) {
      try {
        const url = await referencePhoto(vault, project.id, references[ordinal - 1]!.id, signal);
        output.photos.push({ ordinal, url });
      } catch {
        signal.throwIfAborted();
      }
    }
  }
}
