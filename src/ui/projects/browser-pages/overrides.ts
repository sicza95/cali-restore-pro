import type {
  EntityOverrides,
  ProjectOverrides,
} from '../../../platform/projects/browser-contracts';
import type { BrowserTarget } from '../../../platform/projects/browser/mutations';
import { upgradeProject } from '../../../platform/projects/projects';
import {
  preserveLegacyProjectSettings,
  resolveSettings,
} from '../../../platform/projects/settings';
import type { AccountSettings } from '../../../platform/projects/settings';
import type {
  RestorationObjectV2,
  SavedProject,
  SavedProjectV2,
  SurfaceV2,
} from '../../../platform/projects/types';

const empty = (overrides: object) =>
  Object.values(overrides).every((group) => !group || !Object.keys(group).length);

/**
 * The project with one entity's whole override set replaced, ready to save. A v1 document keeps
 * its saved units and currency as project overrides before it is upgraded. Legacy readers still
 * see the same values: the project's settings mirror its effective units and currency, and a
 * child's units field mirrors its units override (cleared when it inherits).
 */
export function withOverrides(
  project: SavedProject,
  target: BrowserTarget,
  overrides: EntityOverrides | ProjectOverrides,
  account: AccountSettings,
  now = Date.now(),
): SavedProjectV2 {
  const next: SavedProjectV2 = structuredClone({
    ...upgradeProject(preserveLegacyProjectSettings(project)),
    revision: project.revision,
  });
  const value = empty(overrides) ? undefined : structuredClone(overrides);
  if (target.kind === 'project') {
    if (value) next.overrides = value as ProjectOverrides;
    else delete next.overrides;
    const effective = resolveSettings(account, next).restoration;
    next.settings = {
      version: 1,
      units: effective.units.value,
      currency: effective.currency.value,
    };
  } else {
    const object = (next.objects as RestorationObjectV2[]).find(({ id }) => id === target.objectId);
    if (!object) throw new Error('Object not found');
    const entity =
      target.kind === 'object'
        ? object
        : (object.surfaces as SurfaceV2[]).find(({ id }) => id === target.surfaceId);
    if (!entity) throw new Error('Surface not found');
    const restoration = (value as EntityOverrides | undefined)?.restoration;
    if (restoration && 'currency' in restoration) throw new Error('Currency is set on the project');
    entity.units = restoration?.units ?? null;
    if (value) entity.overrides = value as EntityOverrides;
    else delete entity.overrides;
    entity.updatedAt = now;
    object.updatedAt = now;
  }
  next.updatedAt = now;
  return next;
}
