import type { BrowserTarget } from '../browser/mutations';
import type { ProjectV2, RestorationObjectV2, SurfaceV2 } from '../types';
import type { BinCounts, BinEntityRef } from './types';

export type BinEntity = ProjectV2 | RestorationObjectV2 | SurfaceV2;

export function entityRef(projectId: string, target: BrowserTarget): BinEntityRef {
  if (target.kind === 'project') return { kind: 'project', projectId };
  if (target.kind === 'object') return { kind: 'object', projectId, objectId: target.objectId };
  return { kind: 'surface', projectId, objectId: target.objectId, surfaceId: target.surfaceId };
}

export function entityId(ref: BinEntityRef) {
  if (ref.kind === 'project') return ref.projectId;
  return ref.kind === 'object' ? ref.objectId : ref.surfaceId;
}

/** Null when the entity is not in this graph. */
export function findEntity(project: ProjectV2, ref: BinEntityRef): BinEntity | null {
  if (ref.kind === 'project') return project.id === ref.projectId ? project : null;
  const objects = project.objects as RestorationObjectV2[];
  const object = objects.find(({ id }) => id === ref.objectId) ?? null;
  if (!object || ref.kind === 'object') return object;
  return (object.surfaces as SurfaceV2[]).find(({ id }) => id === ref.surfaceId) ?? null;
}

export function surfacesOf(entity: BinEntity): SurfaceV2[] {
  if ('objects' in entity)
    return (entity.objects as RestorationObjectV2[]).flatMap(
      ({ surfaces }) => surfaces as SurfaceV2[],
    );
  return 'surfaces' in entity ? entity.surfaces : [entity];
}

/** Original object/surface IDs inside the subtree, root first. Project roots include their own ID. */
export function subtreeIds(entity: BinEntity): string[] {
  if ('objects' in entity)
    return [
      entity.id,
      ...(entity.objects as RestorationObjectV2[]).flatMap((object) => subtreeIds(object)),
    ];
  if ('surfaces' in entity) return [entity.id, ...entity.surfaces.map(({ id }) => id)];
  return [entity.id];
}

/** Every graph ID currently live in the project, for identity-collision checks. */
export function liveIds(project: ProjectV2): Set<string> {
  return new Set(subtreeIds(project));
}

/** Asset references owned by the subtree: attachments, covers and branding logos. */
export function subtreeAssetIds(entity: BinEntity): string[] {
  const ids = new Set<string>();
  const add = (node: Pick<SurfaceV2, 'cover' | 'overrides'>) => {
    if (node.cover) ids.add(node.cover.assetId);
    const logo = node.overrides?.branding?.logo;
    if (logo) ids.add(logo.assetId);
  };
  if ('objects' in entity) {
    for (const { id } of entity.assets ?? []) ids.add(id);
    entity.objects.forEach(add);
  }
  add(entity);
  for (const surface of surfacesOf(entity)) {
    add(surface);
    for (const { id } of surface.images) ids.add(id);
  }
  return [...ids].sort();
}

export function subtreeCounts(entity: BinEntity): BinCounts {
  const surfaces = surfacesOf(entity);
  return {
    objects: 'objects' in entity ? entity.objects.length : 'surfaces' in entity ? 1 : 0,
    surfaces: surfaces.length,
    photos: surfaces.reduce((sum, surface) => sum + surface.images.length, 0),
  };
}

/** Journal rows per surface and source, matching the drawing-draft deletion guard. */
export function subtreeJournals(projectId: string, entity: BinEntity) {
  return surfacesOf(entity).flatMap((surface) => {
    const sources = new Set([
      ...surface.images.map(({ id }) => id),
      ...(surface.assessments ?? []).map(({ source }) => source.id),
    ]);
    return [...sources]
      .sort()
      .map((source) => ({ project: projectId, surface: surface.id, source }));
  });
}
