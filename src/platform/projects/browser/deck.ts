import type { AssetReference } from '../browser-contracts';
import type { Project, RestorationObject, Surface } from '../types';

type DeckNode = Project | RestorationObject | Surface;
const ordered = <T extends { id: string }>(items: readonly T[]) =>
  [...items].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
function children(node: DeckNode): DeckNode[] {
  return 'objects' in node
    ? ordered(node.objects)
    : 'surfaces' in node
      ? ordered(node.surfaces)
      : [];
}
function representative(node: DeckNode): AssetReference | undefined {
  if (node.cover) return { ...node.cover };
  if ('images' in node) {
    const image = ordered(node.images)[0];
    return image ? { assetId: image.id } : undefined;
  }
  for (const child of children(node)) {
    const image = representative(child);
    if (image) return image;
  }
}
/** One representative per immediate child; surfaces use their attached photos as children.
 * Order depends on stable IDs, never on current browser sort or async completion order.
 */
export function imageDeck(node: DeckNode): AssetReference[] {
  if (node.cover) return [{ ...node.cover }];
  const candidates =
    'images' in node
      ? ordered(node.images).map(({ id }) => ({ assetId: id }))
      : children(node)
          .map(representative)
          .filter((item): item is AssetReference => !!item);
  const unique = new Map<string, AssetReference>();
  for (const image of candidates) {
    unique.set(image.assetId, image);
    if (unique.size === 3) break;
  }
  return [...unique.values()];
}
