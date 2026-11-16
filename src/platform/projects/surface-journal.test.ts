import { describe, expect, it } from 'vitest';
import { newPlanarSurface } from './planar-state';
import {
  carryJournal,
  currentJournal,
  emptyJournal,
  hasDrafts,
  journalHead,
  openJournal,
  photoHistory,
  storedDrafts,
} from './surface-journal';
import type { StoredDraft, SurfaceJournal } from './surface-journal';
import type { PlanarSurface } from './planar-types';

const source = { id: 'photo-1', width: 640, height: 480, embeddedPreview: false };
const draft: StoredDraft = {
  layer: 1,
  pending: [
    {
      id: 10,
      action: 'stroke',
      points: [{ at: [10, 10] }],
      operation: 'add',
      closed: false,
      width: 5,
      region: [
        [0, 0],
        [640, 0],
        [640, 480],
        [0, 480],
      ],
    },
  ],
  undone: [],
};

async function opened(state: PlanarSurface): Promise<SurfaceJournal> {
  const entry = {
    action: 'checkpointChange' as const,
    checkpoint: { before: state, after: state },
  };
  return {
    ...emptyJournal(),
    head: await journalHead(state),
    manual: true,
    drafts: [draft],
    past: [entry],
  };
}

describe('currentJournal', () => {
  const state: PlanarSurface = { ...newPlanarSurface(source), revision: 3 };

  it('keeps the journal for the assessment it was opened against', async () => {
    const journal = await opened(state);
    expect(currentJournal(journal, state, state)).toBe(journal);
  });

  it('keeps the journal when the same assessment arrives as a new object (#63)', async () => {
    const journal = await opened(state);
    const copy = structuredClone(state);
    expect(copy).not.toBe(state);
    expect(currentJournal(journal, state, copy)).toBe(journal);
    // The reopen check agrees: same content, same head.
    expect(await openJournal(JSON.stringify(journal), copy)).toEqual(journal);
  });

  it('reports the drafts as a conflict when the assessment content changed', async () => {
    const detail = { ...state.frame, source: { ...source, id: 'photo-2' } };
    const aligned = { ...state, details: [detail] };
    const journal = await opened(aligned);
    // The detail photo was removed elsewhere: same revision, other content.
    const changed = { ...aligned, details: [] };
    expect(currentJournal(journal, aligned, changed)).toEqual({
      ...emptyJournal(),
      manual: true,
      drafts: [draft],
      conflict: true,
    });
    expect((await openJournal(JSON.stringify(journal), changed)).conflict).toBe(true);
  });

  it('drops history without a conflict when there are no drafts', async () => {
    const journal = { ...(await opened(state)), drafts: [] };
    const next = { ...state, revision: state.revision + 1 };
    expect(currentJournal(journal, state, next)).toEqual({
      ...emptyJournal(),
      manual: true,
      conflict: false,
    });
  });

  it('treats assessments without a revision as the same, as their heads are', async () => {
    const unsaved = newPlanarSurface(source);
    const journal = { ...emptyJournal(), drafts: [draft] };
    expect(currentJournal(journal, unsaved, undefined)).toBe(journal);
    expect(await journalHead(unsaved)).toBe(await journalHead(undefined));
  });
});

describe('hasDrafts and storedDrafts (#72)', () => {
  const state: PlanarSurface = { ...newPlanarSurface(source), revision: 3 };
  const stored = (journal: SurfaceJournal) => storedDrafts(JSON.stringify(journal));

  it('counts pending marks, undone marks only, and the drafts of a conflict', async () => {
    const journal = await opened(state);
    expect(hasDrafts(journal)).toBe(true);
    expect(stored(journal)).toBe(true);
    const undone = { ...journal, drafts: [{ ...draft, pending: [], undone: draft.pending }] };
    expect(hasDrafts(undone)).toBe(true);
    expect(stored(undone)).toBe(true);
    // Written against other content: the surface page opens it as a conflict with the drafts.
    const other = { ...journal, head: 'another device' };
    expect((await openJournal(JSON.stringify(other), state)).conflict).toBe(true);
    expect(stored(other)).toBe(true);
  });

  it('counts nothing without a journal or once every draft is committed or discarded', async () => {
    const journal = { ...(await opened(state)), drafts: [] };
    expect(hasDrafts(journal)).toBe(false);
    expect(stored(journal)).toBe(false);
    expect(storedDrafts(undefined)).toBe(false);
    expect(storedDrafts('')).toBe(false);
  });

  it('rejects a journal it cannot read, as opening it does', () => {
    expect(() => storedDrafts(JSON.stringify({ version: 2 }))).toThrow('Invalid surface journal');
  });
});

describe('carryJournal', () => {
  const photo = (id: string) => ({ ...source, id });
  const detail = (id: string) => ({
    source: photo(id),
    revision: 1,
    input: newPlanarSurface(source).frame.input,
  });
  const alignment = (id: string) => ({
    frameRevision: 1,
    preparationRevision: 1,
    source: photo(id),
    input: { method: 'reference' as const },
  });
  const unaligned: PlanarSurface = {
    ...newPlanarSurface(source),
    revision: 2,
    details: [detail('photo-3')],
    alignments: [alignment('photo-3')],
  };
  // Photo setup aligned photo-2, then changed the main crop.
  const aligned: PlanarSurface = {
    ...unaligned,
    revision: 3,
    details: [detail('photo-3'), detail('photo-2')],
    alignments: [alignment('photo-3'), alignment('photo-2')],
  };
  const cropped: PlanarSurface = {
    ...aligned,
    revision: 4,
    frame: {
      ...aligned.frame,
      revision: 4,
      input: { ...aligned.frame.input, crop: [0, 0, 320, 480] },
    },
  };
  // The user removes photo-2 on this device.
  const removed: PlanarSurface = {
    ...cropped,
    details: [detail('photo-3')],
    alignments: [alignment('photo-3')],
  };
  const retained = new Set(['photo-1', 'photo-3']);
  const stroke = {
    action: 'stroke' as const,
    layer: { id: 1, name: 'Master mask', kind: 'master' as const },
    drawing: { before: { rows: [], order: [1] }, after: { rows: [], order: [1] } },
  };

  async function stored(state: PlanarSurface): Promise<SurfaceJournal> {
    return {
      ...emptyJournal(),
      head: await journalHead(state),
      manual: true,
      drafts: [draft],
      past: [photoHistory(unaligned, aligned), photoHistory(aligned, cropped), stroke],
      future: [{ action: 'checkpointChange', checkpoint: { before: cropped, after: unaligned } }],
    };
  }

  it('carries the drafts to the new head after the user removes a detail photo (#67)', async () => {
    const journal = await stored(cropped);
    const carried = (await carryJournal(JSON.stringify(journal), cropped, removed, retained))!;
    expect(carried.head).toBe(await journalHead(removed));
    expect(carried.drafts).toEqual([draft]);
    expect(carried.manual).toBe(true);
    // The reopen check now finds the drafts current.
    const reopened = await openJournal(JSON.stringify(carried), removed);
    expect(reopened.conflict).toBeUndefined();
    expect(reopened.drafts).toEqual([draft]);
  });

  it('drops the removed photo from history, and steps left without a change', async () => {
    const journal = await stored(cropped);
    const carried = (await carryJournal(JSON.stringify(journal), cropped, removed, retained))!;
    expect(JSON.stringify([carried.past, carried.future])).not.toContain('photo-2');
    // Aligning photo-2 is now a no-op and goes; the crop change and the stroke stay.
    const before = { ...aligned, details: removed.details, alignments: removed.alignments };
    expect(carried.past).toEqual([photoHistory(before, removed), stroke]);
    expect(carried.future).toEqual([
      { action: 'checkpointChange', checkpoint: { before: removed, after: unaligned } },
    ]);
  });

  it('leaves a journal written against other content as a conflict', async () => {
    const journal = await stored(aligned);
    expect(await carryJournal(JSON.stringify(journal), cropped, removed, retained)).toBeUndefined();
  });

  it('writes nothing when the head does not change', async () => {
    const unsaved = { ...newPlanarSurface(source), details: [detail('photo-2')] };
    const journal = { ...emptyJournal(), drafts: [draft] };
    const after = { ...unsaved, details: [] };
    expect(await carryJournal(JSON.stringify(journal), unsaved, after, retained)).toBeUndefined();
  });
});
