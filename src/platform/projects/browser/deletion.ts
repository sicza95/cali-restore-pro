import { storedDrafts, emptyJournal, journalText } from '../surface-journal';
import type { Surface } from '../types';
import type { JournalRef, JournalWrite } from '../../vault/project-store';

export type JournalReader = (
  ref: JournalRef,
) => Promise<{ revision: number; text: string } | undefined>;

/** Reuses the drawing guard, including undone/hidden/conflicted drafts. Fail closed on unreadable
 * journals. Save these unchanged journal writes with the deletion to check their revisions in
 * the project's existing atomic journal transaction. Absent rows are checked at revision zero.
 */
export async function deletionJournals(
  project: string,
  surfaces: readonly Surface[],
  read: JournalReader,
): Promise<JournalWrite[]> {
  const writes: JournalWrite[] = [];
  for (const surface of surfaces) {
    const sources = new Set([
      ...surface.images.map(({ id }) => id),
      ...(surface.assessments ?? []).map(({ source }) => source.id),
    ]);
    for (const source of sources) {
      const ref = { project, surface: surface.id, source };
      const row = await read(ref);
      if (storedDrafts(row?.text)) throw new Error('Resolve drawing drafts before deleting');
      writes.push({
        ref,
        expected: row?.revision ?? 0,
        text: row?.text ?? journalText(emptyJournal()),
      });
    }
  }
  return writes;
}
