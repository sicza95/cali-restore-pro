import type { LocalVault } from '../../vault/vault';
import { localProjects, upgradeProject } from '../projects';
import type { RestorationObject, SavedProject, Surface } from '../types';
import type { BrowserTarget } from './mutations';

/** Children keep immutable file references within the same project; entity identities are fresh. */
export function copySubtree(
  project: SavedProject,
  target: Exclude<BrowserTarget, { kind: 'project' }>,
  name: string,
  creator: string | null,
) {
  const next = structuredClone({ ...upgradeProject(project), revision: project.revision });
  const object = next.objects.find((row) => row.id === target.objectId);
  if (!object) throw new Error('Object unavailable');
  const metadata = () => ({
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    createdBy: creator,
  });
  const surfaceCopy = (surface: Surface): Surface => ({
    ...structuredClone(surface),
    ...metadata(),
    checkpoints: surface.checkpoints?.map((checkpoint) => ({
      ...structuredClone(checkpoint),
      id: crypto.randomUUID(),
    })),
  });
  if (target.kind === 'object') {
    const copy: RestorationObject = {
      ...structuredClone(object),
      ...metadata(),
      name,
      archived: false,
      surfaces: object.surfaces.map(surfaceCopy),
    };
    next.objects.push(copy as typeof object);
  } else {
    const surface = object.surfaces.find((row) => row.id === target.surfaceId);
    if (!surface) throw new Error('Surface unavailable');
    object.surfaces.push({ ...surfaceCopy(surface), name, archived: false } as typeof surface);
    object.updatedAt = Date.now();
  }
  next.updatedAt = Date.now();
  return next;
}

export async function copyBrowserItem(
  vault: LocalVault,
  project: SavedProject,
  target: BrowserTarget,
  name: string,
  creator: string | null,
) {
  if (target.kind !== 'project')
    return localProjects(vault).save(copySubtree(project, target, name, creator));
  const backup = await vault.projectBackups().export(project.id);
  return vault
    .projectBackups()
    .import(backup.blob, backup.code, { copy: { name, createdBy: creator } });
}
