import {
  newObject,
  newSurface,
  projectName,
  upgradeProject,
  validateProject,
  localProjects,
} from '../projects';
import type {
  SavedProject,
  SavedProjectV2,
  ProjectV2,
  RestorationObjectV2,
  SurfaceV2,
} from '../types';
import type { EntityOverrides, ProjectOverrides } from '../browser-contracts';
import type { LocalVault } from '../../vault/vault';
import { coverAssetIds } from './assets';
import { deletionJournals } from './deletion';

export type BrowserTarget =
  | { kind: 'project' }
  | { kind: 'object'; objectId: string }
  | { kind: 'surface'; objectId: string; surfaceId: string };
type Entity = ProjectV2 | RestorationObjectV2 | SurfaceV2;

function objectOf(project: ProjectV2, id: string) {
  const object = (project.objects as RestorationObjectV2[]).find((row) => row.id === id);
  if (!object) throw new Error('Object not found');
  return object;
}
function targetOf(project: ProjectV2, target: BrowserTarget): Entity {
  if (target.kind === 'project') return project;
  const object = objectOf(project, target.objectId);
  if (target.kind === 'object') return object;
  const surface = (object.surfaces as SurfaceV2[]).find((row) => row.id === target.surfaceId);
  if (!surface) throw new Error('Surface not found');
  return surface;
}
function change(
  project: SavedProject,
  target: BrowserTarget,
  mutate: (entity: Entity, project: ProjectV2) => void,
  now = Date.now(),
): SavedProjectV2 {
  const next = structuredClone({ ...upgradeProject(project), revision: project.revision });
  const entity = targetOf(next, target);
  mutate(entity, next);
  entity.updatedAt = now;
  if (target.kind === 'surface') objectOf(next, target.objectId).updatedAt = now;
  next.updatedAt = now;
  validateProject(next, next.id);
  return next;
}

export function createObject(
  project: SavedProject,
  name: string,
  createdBy: string | null,
  now = Date.now(),
): SavedProjectV2 {
  return change(
    project,
    { kind: 'project' },
    (_, next) => {
      next.objects.push({
        ...newObject(name, undefined, createdBy),
        createdAt: now,
        updatedAt: now,
      });
    },
    now,
  );
}
export function createSurface(
  project: SavedProject,
  objectId: string,
  name: string,
  createdBy: string | null,
  now = Date.now(),
): SavedProjectV2 {
  return change(
    project,
    { kind: 'object', objectId },
    (_, next) => {
      objectOf(next, objectId).surfaces.push({
        ...newSurface(name, createdBy),
        createdAt: now,
        updatedAt: now,
      });
    },
    now,
  );
}
export function renameItem(
  project: SavedProject,
  target: BrowserTarget,
  name: string,
  now = Date.now(),
): SavedProjectV2 {
  return change(
    project,
    target,
    (entity) => {
      entity.name = projectName(name);
    },
    now,
  );
}
export function setCover(
  project: SavedProject,
  target: BrowserTarget,
  assetId: string | null,
  now = Date.now(),
): SavedProjectV2 {
  return change(
    project,
    target,
    (entity, next) => {
      if (assetId === null) delete entity.cover;
      else {
        if (!coverAssetIds(next, entity).has(assetId))
          throw new Error('Cover is outside this subtree');
        entity.cover = { assetId };
      }
    },
    now,
  );
}

export type OverrideChange = {
  group: 'restoration' | 'branding';
  key: string;
  /** undefined resets the field; false, empty text and logo:null are explicit overrides. */
  value: unknown;
};
/** Validated by the slice A contract; below-project currency writes are rejected there. */
export function setOverride(
  project: SavedProject,
  target: BrowserTarget,
  write: OverrideChange,
  now = Date.now(),
): SavedProjectV2 {
  const keys =
    write.group === 'branding'
      ? ['studio', 'contact', 'footer', 'accent', 'logo']
      : [
          'units',
          'areaUnit',
          'reportLanguage',
          'snap',
          ...(target.kind === 'project' ? ['currency'] : []),
        ];
  if (!keys.includes(write.key)) throw new Error('Invalid override field');
  return change(
    project,
    target,
    (entity) => {
      const overrides = structuredClone(entity.overrides ?? {}) as Record<
        string,
        Record<string, unknown>
      >;
      const group = overrides[write.group] ?? {};
      if (write.value === undefined) delete group[write.key];
      else group[write.key] = structuredClone(write.value);
      if (Object.keys(group).length) overrides[write.group] = group;
      else delete overrides[write.group];
      if (Object.keys(overrides).length)
        entity.overrides = overrides as EntityOverrides & ProjectOverrides;
      else delete entity.overrides;
    },
    now,
  );
}

/** Counts for the UI's confirmation. Photos are attachment occurrences, not file deletions. */
export function deletionCounts(
  project: SavedProject,
  target: Exclude<BrowserTarget, { kind: 'project' }>,
) {
  const entity = targetOf(upgradeProject(project), target);
  const surfaces = 'surfaces' in entity ? entity.surfaces : [entity as SurfaceV2];
  return {
    objects: target.kind === 'object' ? 1 : 0,
    surfaces: surfaces.length,
    photos: surfaces.reduce((sum, surface) => sum + surface.images.length, 0),
  };
}

/** Persistence adapter: child deletion must use these guarded methods after UI confirmation.
 * Files, checkpoints, journals and issued snapshots are retained; no physical garbage collection.
 */
export function browserMutations(vault: LocalVault, createdBy: string | null) {
  const store = localProjects(vault);
  const save = (next: SavedProjectV2) => store.save(next);
  async function remove(
    project: SavedProject,
    target: Exclude<BrowserTarget, { kind: 'project' }>,
  ) {
    const entity = targetOf(upgradeProject(project), target);
    const surfaces = 'surfaces' in entity ? entity.surfaces : [entity as SurfaceV2];
    const journals = await deletionJournals(project.id, surfaces, (ref) =>
      vault.projects().readJournal(ref),
    );
    const now = Date.now();
    const next = change(
      project,
      { kind: 'project' },
      (_, next) => {
        if (target.kind === 'object')
          next.objects = (next.objects as RestorationObjectV2[]).filter(
            ({ id }) => id !== target.objectId,
          );
        else {
          const object = objectOf(next, target.objectId);
          object.surfaces = (object.surfaces as SurfaceV2[]).filter(
            ({ id }) => id !== target.surfaceId,
          );
          object.updatedAt = now;
        }
        // An ancestor's cover may have pointed at a removed descendant photo.
        const clear = (node: Entity) => {
          if (node.cover && !coverAssetIds(next, node).has(node.cover.assetId)) delete node.cover;
        };
        clear(next);
        for (const object of next.objects) clear(object);
      },
      now,
    );
    return store.save(next, undefined, journals);
  }
  return {
    createObject: (project: SavedProject, name: string) =>
      save(createObject(project, name, createdBy)),
    createSurface: (project: SavedProject, objectId: string, name: string) =>
      save(createSurface(project, objectId, name, createdBy)),
    rename: (project: SavedProject, target: BrowserTarget, name: string) =>
      save(renameItem(project, target, name)),
    setCover: (project: SavedProject, target: BrowserTarget, assetId: string | null) =>
      save(setCover(project, target, assetId)),
    setOverride: (project: SavedProject, target: BrowserTarget, write: OverrideChange) =>
      save(setOverride(project, target, write)),
    deleteObject: (project: SavedProject, objectId: string) =>
      remove(project, { kind: 'object', objectId }),
    deleteSurface: (project: SavedProject, objectId: string, surfaceId: string) =>
      remove(project, { kind: 'surface', objectId, surfaceId }),
    async uploadCover(
      project: SavedProject,
      target: BrowserTarget,
      file: File,
      signal: AbortSignal,
      progress: (fraction: number) => void = () => {},
    ) {
      let saved: SavedProjectV2 | undefined;
      await vault.files().importImage(
        project.id,
        file,
        async (ref, operation) => {
          const registered = {
            ...upgradeProject(project),
            revision: project.revision,
            assets: [...(project.assets ?? []), { id: ref.id, purpose: 'cover' as const }],
          };
          const next = setCover(registered, target, ref.id);
          saved = await store.save(next, { id: ref.id, signal: operation });
        },
        { signal, progress },
      );
      return saved!;
    },
  };
}
