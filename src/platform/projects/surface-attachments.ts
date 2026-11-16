import type { PlanarSurface } from './planar-types';
import { carryJournal, journalText, storedDrafts } from './surface-journal';
import type { SurfaceJournal } from './surface-journal';
import type { Attachment, Surface } from './types';
import type { JournalRef, JournalWrite } from '../vault/project-store';

export type CarriedJournal = { write: JournalWrite; journal: SurfaceJournal };

/**
 * A photo change the user makes on this device: the surface changes from `updateSurfaceImages`,
 * and the journal of each assessment it changes carried forward, to be saved with them, so the
 * drafts stay editable after removing a detail photo (#67). Untouched assessments read nothing.
 */
export async function changeSurfaceImages(
  readJournal: (ref: JournalRef) => Promise<{ revision: number; text: string } | undefined>,
  scope: Omit<JournalRef, 'source'>,
  surface: Surface,
  images: Attachment[],
) {
  const changes = updateSurfaceImages(surface, images);
  const retained = new Set(images.map((image) => image.id));
  const journals: CarriedJournal[] = [];
  for (const after of changes.assessments ?? []) {
    const before = surface.assessments!.find((entry) => entry.source.id === after.source.id)!;
    if (after === before) continue;
    const ref = { ...scope, source: after.source.id };
    const row = await readJournal(ref);
    const journal = row && (await carryJournal(row.text, before, after, retained));
    if (row && journal)
      journals.push({
        write: { ref, expected: row.revision, text: journalText(journal) },
        journal,
      });
  }
  return { changes, journals };
}

/**
 * The photos whose stored journal holds drawing drafts. Every photo given is read, whatever its
 * role: a photo keeps its drafts when it stops being the reference, the first photo with the
 * mapping role, whose journal the surface page opens (#72, #75). An unreadable or invalid journal
 * holds none, as on the surface page.
 */
export async function draftPhotos(
  readJournal: (ref: JournalRef) => Promise<{ text: string } | undefined>,
  scope: Omit<JournalRef, 'source'>,
  images: readonly Pick<Attachment, 'id'>[],
) {
  const found = await Promise.all(
    images.map(({ id }) =>
      readJournal({ ...scope, source: id })
        .then((row) => storedDrafts(row?.text))
        .catch(() => false),
    ),
  );
  return new Set(images.filter((_, index) => found[index]).map(({ id }) => id));
}

/** Why a photo's controls are blocked: drafts pending on the reference, or drafts it hides. */
export type DraftBlock = { remove?: 'pending' | 'hidden'; role?: true };

/**
 * What the drawing drafts block among a surface's originals, given the photos whose journal holds
 * drafts. While the reference has drafts, its "Remove" and role are blocked (#72), and so is the
 * role of every photo listed before it, since the mapping role would make that photo the reference
 * and hide the drafts (#75). Any other photo with drafts cannot be removed, but its role stays
 * free: making it the reference again is how its drafts are brought back and resolved (#75).
 */
export function draftBlocks(images: readonly Attachment[], drafts: ReadonlySet<string>) {
  const reference = images.findIndex((image) => image.role === 'mapping');
  const pending = reference >= 0 && drafts.has(images[reference]!.id);
  const blocks = new Map<string, DraftBlock>();
  images.forEach(({ id }, index) => {
    const block: DraftBlock = {};
    if (drafts.has(id)) block.remove = index === reference ? 'pending' : 'hidden';
    if (pending && index <= reference) block.role = true;
    if (block.remove || block.role) blocks.set(id, block);
  });
  return blocks;
}

/** New images for a surface; assessments lose removed photos, and untouched ones stay as they are. */
export function updateSurfaceImages(surface: Surface, images: Attachment[]): Partial<Surface> {
  const retained = new Set(images.map((image) => image.id));
  const kept = (entry: { source: { id: string } }) => retained.has(entry.source.id);
  return {
    images,
    assessments: surface.assessments?.filter(kept).map((entry) =>
      entry.details.every(kept) && entry.alignments.every(kept)
        ? entry
        : {
            ...entry,
            details: entry.details.filter(kept),
            alignments: entry.alignments.filter(kept),
          },
    ),
  };
}

export function remapSurfaceImages(surface: Surface, ids: ReadonlyMap<string, string>): Surface {
  const remap = <T extends { id: string }>(entry: T): T => {
    const id = ids.get(entry.id);
    if (!id) throw new Error('Missing restored photo');
    return { ...entry, id };
  };
  const remapAssessment = (entry: PlanarSurface): PlanarSurface => ({
    ...entry,
    source: remap(entry.source),
    frame: { ...entry.frame, source: remap(entry.frame.source) },
    details: entry.details.map((detail) => ({ ...detail, source: remap(detail.source) })),
    alignments: entry.alignments.map((alignment) => ({
      ...alignment,
      source: remap(alignment.source),
    })),
  });
  return {
    ...surface,
    images: surface.images.map(remap),
    assessments: surface.assessments?.map(remapAssessment),
    checkpoints: surface.checkpoints?.map((checkpoint) => ({
      ...checkpoint,
      assessment: remapAssessment(checkpoint.assessment),
    })),
  };
}
