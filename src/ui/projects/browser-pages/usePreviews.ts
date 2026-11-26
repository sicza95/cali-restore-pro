import { createEffect, createMemo, createSignal, onCleanup, untrack } from 'solid-js';
import type { AssetReference } from '../../../platform/projects/browser-contracts';
import { thumbnailObjectURL } from '../../../platform/projects/browser/thumbnails';
import type { LocalVault } from '../../../platform/vault/vault';
import type { BrowserPreview } from '../browser/types';

/** Photos are immutable per file ID, so one cache version covers every thumbnail. */
const thumbnailVersion = 'proxy-1';

export type PreviewSource = {
  id: string;
  project: string;
  /** A dedicated cover, or up to three deck images; covers replace the deck. */
  cover: boolean;
  assets: readonly AssetReference[];
};

/**
 * Thumbnail URLs for the items on screen, made lazily from the working proxies already on this
 * device. Requests share the platform's bounded queue; leaving the level cancels the rest and
 * revokes every URL. A photo that is not on this device keeps the placeholder: the browser never
 * downloads originals to draw a tile.
 */
export function usePreviews(vault: () => LocalVault, sources: () => readonly PreviewSource[]) {
  const files = untrack(() => vault().files());
  const lifetime = new AbortController();
  const slots = new Map<string, ReturnType<typeof thumbnailObjectURL>>();
  const [urls, setUrls] = createSignal<Readonly<Record<string, string>>>({});
  onCleanup(() => {
    lifetime.abort();
    for (const slot of slots.values()) slot.dispose();
    slots.clear();
  });
  createEffect(() => {
    for (const source of sources())
      for (const { assetId } of source.assets) {
        const key = source.project + '/' + assetId;
        if (slots.has(key)) continue;
        const slot = thumbnailObjectURL(lifetime.signal);
        slots.set(key, slot);
        files
          .thumbnail({ project: source.project, id: assetId }, thumbnailVersion, {
            signal: lifetime.signal,
          })
          .then((blob) => {
            const url = slot.set(blob);
            if (url) setUrls((current) => ({ ...current, [key]: url }));
          })
          .catch(() => undefined);
      }
  });
  return createMemo(() => {
    const ready = urls();
    const previews: Record<string, BrowserPreview> = {};
    for (const source of sources()) {
      const found = source.assets
        .map(({ assetId }) => ready[source.project + '/' + assetId])
        .filter((url): url is string => !!url);
      previews[source.id] = source.cover ? { cover: found[0] } : { images: found };
    }
    return previews;
  });
}
