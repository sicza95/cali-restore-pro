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
 * The photo the surface's drawing drafts belong to, while its journal holds drafts: the first
 * photo with the mapping role, whose journal the surface page opens (#72).
 */
export async function draftSource(
  readJournal: (ref: JournalRef) => Promise<{ text: string } | undefined>,
  scope: Omit<JournalRef, 'source'>,
  surface: Pick<Surface, 'images'>,
) {
  const source = surface.images.find((image) => image.role === 'mapping')?.id;
  if (source && storedDrafts((await readJournal({ ...scope, source }))?.text)) return source;
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
