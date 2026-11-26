import type { Project, RestorationObject, Surface } from '../types';

type AssetEntity = Pick<Surface, 'cover' | 'overrides'>;
/** Includes dedicated assets even when currently unused: old snapshots may still reference them. */
export function projectAssetIds(project: Project): Set<string> {
  const ids = new Set(project.assets?.map(({ id }) => id));
  const add = (entity: AssetEntity) => {
    if (entity.cover) ids.add(entity.cover.assetId);
    const logo = entity.overrides?.branding?.logo;
    if (logo) ids.add(logo.assetId);
  };
  add(project);
  for (const object of project.objects) {
    add(object);
    for (const surface of object.surfaces) {
      add(surface);
      for (const image of surface.images) ids.add(image.id);
    }
  }
  return ids;
}

export function remapEntityAssets<T extends AssetEntity>(
  entity: T,
  ids: ReadonlyMap<string, string>,
): T {
  const remap = (id: string) => {
    const next = ids.get(id);
    if (!next) throw new Error('Missing restored asset');
    return next;
  };
  const logo = entity.overrides?.branding?.logo;
  return {
    ...entity,
    ...(entity.cover ? { cover: { assetId: remap(entity.cover.assetId) } } : {}),
    ...(logo
      ? {
          overrides: {
            ...entity.overrides,
            branding: {
              ...entity.overrides!.branding,
              logo: { assetId: remap(logo.assetId) },
            },
          },
        }
      : {}),
  };
}

/** Only attachments within this subtree or a dedicated cover are eligible. */
export function coverAssetIds(
  project: Project,
  entity: Project | RestorationObject | Surface,
): Set<string> {
  const ids = new Set(
    project.assets?.filter(({ purpose }) => purpose === 'cover').map(({ id }) => id),
  );
  const surfaces =
    'objects' in entity
      ? entity.objects.flatMap(({ surfaces }) => surfaces)
      : 'surfaces' in entity
        ? entity.surfaces
        : [entity];
  for (const surface of surfaces) for (const { id } of surface.images) ids.add(id);
  return ids;
}
