import type { AccountSettings } from '../projects/settings';
import { resolveSettings } from '../projects/settings';
import type { Project } from '../projects/types';
import type { PreviewSurface, ReportSettings } from './types';

/** Apply inherited area units to a selection without changing saved assessments or geometry. */
export function resolveReportSurfaceUnits(
  account: AccountSettings,
  project: Project,
  settings: ReportSettings,
  surfaces: PreviewSurface[],
): PreviewSurface[] {
  if (settings.unit !== 'inherited') return surfaces;
  const owners = new Map(
    project.objects.flatMap((object) => object.surfaces.map((surface) => [surface.id, object.id])),
  );
  return surfaces.map((surface) => {
    const objectId = owners.get(surface.id);
    if (!objectId) throw new Error('Report surface not found');
    const resolved = resolveSettings(account, project, { objectId, surfaceId: surface.id });
    return { ...surface, unit: resolved.restoration.areaUnit.value };
  });
}
