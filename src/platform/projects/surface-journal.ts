import { assertDrawing, commitDrawing } from './drawing-state';
import type { DrawingLayer, DrawingMark } from './planar-drawing';
import type { PlanarSurface } from './planar-types';

export const historyLimit = 30;
const historyBudget = 384 * 1024;
const draftBudget = 256 * 1024;
const encoder = new TextEncoder();
const sizeOf = (data: unknown) => encoder.encode(JSON.stringify(data)).byteLength;
type Action =
  DrawingMark['action'] | 'points' | 'batch' | 'layerChange' | 'photoChange' | 'checkpointChange';
type PhotoContext = Pick<PlanarSurface, 'frame' | 'details' | 'alignments'> & {
  calibration: PlanarSurface['calibration'] | null;
};
type LayerSide = { rows: DrawingLayer[]; order: number[] };
export type HistoryEntry = {
  action: Action;
  layer?: Pick<DrawingLayer, 'id' | 'name' | 'kind'>;
} & (
  | { drawing: { before: LayerSide; after: LayerSide } }
  | { photo: { before: PhotoContext; after: PhotoContext } }
  | { checkpoint: { before: PlanarSurface; after: PlanarSurface } }
);

export type StoredDraft = { layer: number; pending: DrawingMark[]; undone: DrawingMark[] };
export type SurfaceJournal = {
  version: 1;
  head: string;
  manual: boolean;
  conflict?: boolean;
  drafts: StoredDraft[];
  past: HistoryEntry[];
  future: HistoryEntry[];
};

export const emptyJournal = (): SurfaceJournal => ({
  version: 1,
  head: '',
  manual: false,
  drafts: [],
  past: [],
  future: [],
});

/** The text a journal head hashes: the assessment's JSON, or nothing before its first revision. */
const headText = (state?: PlanarSurface) => (state?.revision ? JSON.stringify(state) : '');

export async function journalHead(state?: PlanarSurface) {
  const text = headText(state);
  if (!text) return '';
  const bytes = encoder.encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function parseJournal(text: string) {
  const journal = JSON.parse(text) as SurfaceJournal;
  if (
    journal.version !== 1 ||
    typeof journal.manual !== 'boolean' ||
    !Array.isArray(journal.drafts) ||
    !Array.isArray(journal.past) ||
    !Array.isArray(journal.future) ||
    journal.past.length + journal.future.length > historyLimit
  )
    throw new Error('Invalid surface journal');
  return journal;
}

/**
 * Whether the journal holds drawing drafts: pending or undone marks on any layer, also in a
 * conflict, which keeps them. Their photo cannot be removed or re-roled meanwhile (#72).
 */
export const hasDrafts = (journal: SurfaceJournal) => journal.drafts.length > 0;

/** `hasDrafts` for a stored journal, with or without a head that matches the assessment. */
export const storedDrafts = (text: string | undefined) => !!text && hasDrafts(parseJournal(text));

export async function openJournal(text: string | undefined, state?: PlanarSurface) {
  if (!text) return emptyJournal();
  const journal = parseJournal(text);
  const head = await journalHead(state);
  if (journal.head === head) return journal;
  return {
    ...emptyJournal(),
    head,
    manual: journal.manual,
    drafts: journal.drafts,
    conflict: journal.drafts.length > 0,
  };
}

/**
 * The open journal against the current assessment: drafts written against other content are a
 * conflict, as in `openJournal`. Content, not identity: an unchanged assessment can arrive as a
 * new object (#63).
 */
export function currentJournal(
  journal: SurfaceJournal,
  loaded: PlanarSurface | undefined,
  current: PlanarSurface | undefined,
): SurfaceJournal {
  if (loaded === current || headText(loaded) === headText(current)) return journal;
  return {
    ...emptyJournal(),
    manual: journal.manual,
    drafts: journal.drafts,
    conflict: journal.drafts.length > 0,
  };
}

type PhotoLists = Pick<PlanarSurface, 'details' | 'alignments'>;

/** Both sides of a history step without removed photos; nothing when the step no longer changes anything. */
function prunedSides<T extends PhotoLists>(
  sides: { before: T; after: T },
  retained: ReadonlySet<string>,
) {
  const kept = (side: T) =>
    [...side.details, ...side.alignments].every(({ source }) => retained.has(source.id));
  if (kept(sides.before) && kept(sides.after)) return sides;
  const prune = (side: T): T => ({
    ...side,
    details: side.details.filter(({ source }) => retained.has(source.id)),
    alignments: side.alignments.filter(({ source }) => retained.has(source.id)),
  });
  const before = prune(sides.before);
  const after = prune(sides.after);
  if (JSON.stringify(before) !== JSON.stringify(after)) return { before, after };
}

function pruneHistory(entries: HistoryEntry[], retained: ReadonlySet<string>) {
  return entries.flatMap((entry): HistoryEntry[] => {
    if ('photo' in entry) {
      const photo = prunedSides(entry.photo, retained);
      return photo ? [photo === entry.photo ? entry : { ...entry, photo }] : [];
    }
    if ('checkpoint' in entry) {
      const checkpoint = prunedSides(entry.checkpoint, retained);
      return checkpoint ? [checkpoint === entry.checkpoint ? entry : { ...entry, checkpoint }] : [];
    }
    return [entry];
  });
}

/**
 * The stored journal carried to `after`, a change the user made on this device outside the
 * journal (removing photos, #67): drafts stay, and history loses the photos that are not
 * `retained`, so undo cannot bring one back. Nothing when the journal was written against other
 * content than `before` (that stays a conflict) or when the head does not change.
 */
export async function carryJournal(
  text: string,
  before: PlanarSurface,
  after: PlanarSurface,
  retained: ReadonlySet<string>,
): Promise<SurfaceJournal | undefined> {
  const journal = parseJournal(text);
  if (journal.head !== (await journalHead(before))) return;
  const head = await journalHead(after);
  if (head === journal.head) return;
  return {
    ...journal,
    head,
    past: pruneHistory(journal.past, retained),
    future: pruneHistory(journal.future, retained),
  };
}

export function journalText(journal: SurfaceJournal) {
  if (sizeOf(journal.drafts) > draftBudget)
    throw new Error('Pending marks exceed the recovery budget');
  return JSON.stringify(journal);
}

export function recordHistory(journal: SurfaceJournal, entry: HistoryEntry) {
  const past = [...journal.past, entry].slice(-historyLimit);
  const sizes = past.map(sizeOf);
  let size = sizes.reduce((total, bytes) => total + bytes, 0);
  while (size > historyBudget) {
    size -= sizes.shift()!;
    past.shift();
  }
  return { ...journal, past, future: [] };
}

export function drawingHistory(
  before: DrawingLayer[],
  after: DrawingLayer[],
  layer: HistoryEntry['layer'],
  action: Action,
): HistoryEntry {
  const side = (rows: DrawingLayer[], other: DrawingLayer[]) => {
    const byId = new Map(other.map((row) => [row.id, row]));
    return {
      order: rows.map((row) => row.id),
      rows: rows.filter((row) => byId.get(row.id) !== row),
    };
  };
  return { action, layer, drawing: { before: side(before, after), after: side(after, before) } };
}

export function photoHistory(before: PlanarSurface, after: PlanarSurface): HistoryEntry {
  const context = ({ frame, calibration, details, alignments }: PlanarSurface) => ({
    frame,
    calibration: calibration ?? null,
    details,
    alignments,
  });
  return {
    action: 'photoChange',
    photo: { before: context(before), after: context(after) },
  };
}

export function stepAssessment(
  state: PlanarSurface,
  layers: DrawingLayer[],
  entry: HistoryEntry,
  redo: boolean,
) {
  const direction = redo ? 'after' : 'before';
  if ('checkpoint' in entry)
    return { ...entry.checkpoint[direction], revision: state.revision + 1 };
  if ('photo' in entry) {
    const context = entry.photo[direction];
    return {
      ...state,
      ...context,
      calibration: context.calibration ?? undefined,
      revision: state.revision + 1,
    };
  }
  const { rows, order } = entry.drawing[direction];
  const byId = new Map([...layers, ...rows].map((row) => [row.id, row]));
  return commitDrawing(
    state,
    order.map((id) => byId.get(id)!),
  );
}

export function checkDrafts(drafts: StoredDraft[], layers: DrawingLayer[]) {
  const rows = new Map(layers.map((row) => [row.id, row]));
  for (const draft of drafts) {
    const row = rows.get(draft.layer);
    if (!row || row.kind === 'folder') throw new Error('Missing draft layer');
    const marks = [...row.marks, ...draft.pending, ...draft.undone];
    assertDrawing([{ ...row, id: 1, kind: 'master', parent: 0, marks }]);
  }
}
