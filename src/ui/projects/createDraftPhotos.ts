import { createResource } from 'solid-js';
import { draftPhotos } from '../../platform/projects/surface-attachments';
import type { SavedProject, Surface } from '../../platform/projects/types';
import type { LocalVault } from '../../platform/vault/vault';

/**
 * The photos of a surface whose journal holds drawing drafts, for `ProjectOriginals` (#72, #75).
 * Read again after every save (the project revision) and when the surface changes; a page mounts
 * it again on the way back from another route. The surface page passes the photo whose journal it
 * has open, with whether that journal has drafts now, and its stored journal is not read.
 */
export function createDraftPhotos(options: {
  vault: () => LocalVault;
  project: () => SavedProject;
  surface: () => Surface;
  open?: () => string | undefined;
  openDrafts?: () => boolean;
}) {
  const [stored] = createResource(
    () => ({
      project: options.project().id,
      revision: options.project().revision,
      surface: options.surface(),
      open: options.open?.(),
    }),
    async ({ project, surface, open }) => {
      // An unreadable journal blocks nothing, as on the surface page.
      try {
        const documents = options.vault().projects();
        return await draftPhotos(
          (ref) => documents.readJournal(ref),
          { project, surface: surface.id },
          surface.images.filter(({ id }) => id !== open),
        );
      } catch {
        return new Set<string>();
      }
    },
  );
  const drafts = () => {
    const found = new Set(stored.latest);
    const open = options.open?.();
    if (open && options.openDrafts?.()) found.add(open);
    return found;
  };
  // While the read runs, the originals' controls are held, so no change slips in before it.
  return { drafts, loading: () => stored.loading };
}
