import { describe, expect, it } from 'vitest';
import { newPlanarSurface } from './planar-state';
import { currentJournal, emptyJournal, journalHead, openJournal } from './surface-journal';
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
