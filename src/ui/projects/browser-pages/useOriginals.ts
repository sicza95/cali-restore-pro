import { createEffect, createSignal, onCleanup, untrack } from 'solid-js';
import type { BrowserOriginalAvailability } from '../../../platform/projects/browser-contracts';
import { originalAvailability } from '../../../platform/projects/browser/status';
import type { Project, RestorationObject, Surface } from '../../../platform/projects/types';
import type { LocalVault } from '../../../platform/vault/vault';

type Node = Project | RestorationObject | Surface;

/** Every attached photo in an item's subtree, in a stable order. */
export function subtreePhotos(node: Node): string[] {
  const surfaces =
    'objects' in node
      ? node.objects.flatMap(({ surfaces }) => surfaces)
      : 'surfaces' in node
        ? node.surfaces
        : [node];
  return [...new Set(surfaces.flatMap(({ images }) => images.map(({ id }) => id)))];
}

/**
 * Whether each item's originals are on this device, checked one file at a time from local storage
 * only. Unchecked files count as unknown, so a tile never claims availability it has not seen.
 */
export function useOriginals(
  vault: () => LocalVault,
  sources: () => readonly { project: string; photos: readonly string[] }[],
) {
  const files = untrack(() => vault().files());
  const [known, setKnown] = createSignal<Readonly<Record<string, boolean>>>({});
  const asked = new Set<string>();
  const queue: { project: string; id: string }[] = [];
  let running = false;
  let disposed = false;
  onCleanup(() => {
    disposed = true;
    queue.length = 0;
  });
  async function drain() {
    if (running) return;
    running = true;
    while (queue.length && !disposed) {
      const ref = queue.shift()!;
      const present = await files.metadata(ref).then(
        () => true,
        () => false,
      );
      if (!disposed) setKnown((current) => ({ ...current, [ref.project + '/' + ref.id]: present }));
    }
    running = false;
  }
  createEffect(() => {
    for (const source of sources())
      for (const id of source.photos) {
        const key = source.project + '/' + id;
        if (asked.has(key)) continue;
        asked.add(key);
        queue.push({ project: source.project, id });
      }
    void drain();
  });
  // An item without photos says so rather than claiming its originals are, or are not, offline.
  return (project: string, photos: readonly string[]): BrowserOriginalAvailability =>
    originalAvailability(photos.map((id) => known()[project + '/' + id] ?? null));
}
