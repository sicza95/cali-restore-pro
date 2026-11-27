import type { EstimateDocument } from '../../estimates/types';
import type { ReportDraft } from '../../reports/types';
import type { JournalWrite } from '../../vault/project-store';
import type { BinDocumentCapture, BinJournalCapture, SavedText } from './capture';
import { BinError } from './errors';

/**
 * Journals come back under their original keys. An existing row with different content is an
 * identity collision and blocks the restore; identical content is an idempotent no-op.
 */
export function journalRestores(
  project: string,
  journals: readonly BinJournalCapture[],
  current: ReadonlyMap<string, SavedText>,
): JournalWrite[] {
  const writes: JournalWrite[] = [];
  for (const journal of journals) {
    const key = `${journal.surface}:${journal.source}`;
    const live = current.get(key);
    if (live && live.text === journal.text) continue;
    if (live) throw new BinError('identity_collision', { journal: key });
    writes.push({
      ref: { project, surface: journal.surface, source: journal.source },
      expected: 0,
      text: journal.text,
    });
  }
  return writes;
}

export type DocumentMerge = { kind: 'estimate' | 'report'; text: string; expected: number } | null;

/**
 * Restores subtree-owned rows into the current document without rewinding anything else:
 * unrelated rows, settings and newer values stay; immutable snapshots and issuance are never
 * touched. Existing rows with the same ID keep their current value.
 */
export function mergeDocument(
  capture: BinDocumentCapture,
  current: SavedText | undefined,
): DocumentMerge {
  if (capture.scope === 'whole') {
    // A newer current document wins; the captured one only fills a gap.
    if (current) return null;
    return { kind: capture.kind, text: capture.text, expected: 0 };
  }
  // Without a current document there is nothing to merge subtree rows into.
  if (!current) return null;
  if (capture.kind === 'estimate') {
    const doc = JSON.parse(current.text) as EstimateDocument;
    const draft = doc.draft;
    const phases = new Set(draft.phases.map(({ id }) => id));
    const extras = new Set(draft.extras.map(({ id }) => id));
    const objects = new Map(draft.objects.map((row) => [row.id, row]));
    const next = {
      ...doc,
      draft: {
        ...draft,
        phases: [...draft.phases, ...capture.rows.phases.filter(({ id }) => !phases.has(id))],
        extras: [...draft.extras, ...capture.rows.extras.filter(({ id }) => !extras.has(id))],
        objects: [
          ...draft.objects.map((row) => {
            const restored = capture.rows.objects.find(({ id }) => id === row.id);
            if (!restored) return row;
            return {
              ...row,
              surfaces: [
                ...row.surfaces,
                ...restored.surfaces.filter((id) => !row.surfaces.includes(id)),
              ],
            };
          }),
          ...capture.rows.objects.filter(({ id }) => !objects.has(id)),
        ],
      },
    };
    const text = JSON.stringify(next);
    return text === current.text ? null : { kind: 'estimate', text, expected: current.revision };
  }
  const doc = JSON.parse(current.text) as ReportDraft;
  const surfaces = { ...capture.rows.surfaces, ...doc.settings.surfaces };
  const excluded = [
    ...doc.settings.excluded,
    ...capture.rows.excluded.filter((id) => !doc.settings.excluded.includes(id)),
  ];
  const text = JSON.stringify({ ...doc, settings: { ...doc.settings, surfaces, excluded } });
  return text === current.text ? null : { kind: 'report', text, expected: current.revision };
}
