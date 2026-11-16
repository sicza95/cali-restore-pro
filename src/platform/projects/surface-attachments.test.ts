import { describe, expect, it } from 'vitest';
import { newPlanarSurface } from './planar-state';
import {
  changeSurfaceImages,
  draftBlocks,
  draftPhotos,
  updateSurfaceImages,
} from './surface-attachments';
import { emptyJournal, journalHead } from './surface-journal';
import type { StoredDraft } from './surface-journal';
import type { JournalRef } from '../vault/project-store';
import type { PlanarSurface } from './planar-types';
import type { Surface } from './types';

const frame = (id: string) => ({ id, width: 640, height: 480, embeddedPreview: false });

function surface(): Surface {
  const main = newPlanarSurface(frame('main'));
  const aligned: PlanarSurface = {
    ...main,
    revision: 2,
    details: [{ ...main.frame, source: frame('detail') }],
    alignments: [
      {
        frameRevision: 1,
        preparationRevision: 1,
        source: frame('detail'),
        input: { method: 'reference' },
      },
    ],
  };
  return {
    id: 'surface',
    name: 'Upper plaster',
    units: null,
    images: [
      { id: 'main', role: 'mapping' },
      { id: 'detail', role: 'mapping' },
    ],
    assessments: [aligned, newPlanarSurface(frame('other'))],
  };
}

describe('updateSurfaceImages', () => {
  it('keeps every assessment object when a photo is attached (#63)', () => {
    const before = surface();
    const images = [...before.images, { id: 'reference', role: 'reference' as const }];
    const after = updateSurfaceImages(before, images);
    expect(after.images).toBe(images);
    expect(after.assessments).toHaveLength(1);
    expect(after.assessments![0]).toBe(before.assessments![0]);
  });

  it('keeps the assessment object when a role changes', () => {
    const before = surface();
    const images = before.images.map((image) =>
      image.id === 'detail' ? { ...image, role: 'reference' as const } : image,
    );
    expect(updateSurfaceImages(before, images).assessments![0]).toBe(before.assessments![0]);
  });

  it('drops a removed photo from details and alignments, and assessments of removed sources', () => {
    const before = surface();
    const after = updateSurfaceImages(before, [{ id: 'main', role: 'mapping' }]);
    expect(after.assessments).toEqual([{ ...before.assessments![0], details: [], alignments: [] }]);
    expect(after.assessments![0]).not.toBe(before.assessments![0]);
  });
});

describe('changeSurfaceImages', () => {
  const scope = { project: 'project', surface: 'surface' };
  const drafts = [{ layer: 1, pending: [], undone: [] }];
  function journals(rows: Record<string, { revision: number; text: string }>) {
    const reads: string[] = [];
    const read = (ref: JournalRef) => {
      reads.push(ref.source);
      return Promise.resolve(rows[ref.source]);
    };
    return { reads, read };
  }

  it('reads no journal when a photo is attached', async () => {
    const before = surface();
    const { reads, read } = journals({});
    const images = [...before.images, { id: 'reference', role: 'reference' as const }];
    const result = await changeSurfaceImages(read, scope, before, images);
    expect(result.changes).toEqual(updateSurfaceImages(before, images));
    expect(result.journals).toEqual([]);
    expect(reads).toEqual([]);
  });

  it('carries the journal of an assessment the removal changes (#67)', async () => {
    const before = surface();
    const head = await journalHead(before.assessments![0]);
    const stored = { ...emptyJournal(), head, drafts };
    const { reads, read } = journals({ main: { revision: 5, text: JSON.stringify(stored) } });
    const images = [{ id: 'main', role: 'mapping' as const }];
    const result = await changeSurfaceImages(read, scope, before, images);
    // The dropped assessment ("other") has no journal to carry; only the changed one is read.
    expect(reads).toEqual(['main']);
    const [carried] = result.journals;
    const after = result.changes.assessments![0]!;
    expect(carried!.journal).toEqual({ ...stored, head: await journalHead(after) });
    expect(carried!.write).toEqual({
      ref: { ...scope, source: 'main' },
      expected: 5,
      text: JSON.stringify(carried!.journal),
    });
  });

  it('writes nothing without a journal or for one written against other content', async () => {
    const before = surface();
    const images = [{ id: 'main', role: 'mapping' as const }];
    expect((await changeSurfaceImages(journals({}).read, scope, before, images)).journals).toEqual(
      [],
    );
    const stale = { ...emptyJournal(), head: 'older', drafts };
    const { read } = journals({ main: { revision: 2, text: JSON.stringify(stale) } });
    expect((await changeSurfaceImages(read, scope, before, images)).journals).toEqual([]);
  });
});

describe('draftPhotos (#72, #75)', () => {
  const scope = { project: 'project', surface: 'surface' };
  const text = (drafts: StoredDraft[]) => JSON.stringify({ ...emptyJournal(), drafts });
  const undone: StoredDraft[] = [{ layer: 1, pending: [], undone: [] }];
  function journals(rows: Record<string, string>, failing: string[] = []) {
    const reads: JournalRef[] = [];
    const read = (ref: JournalRef) => {
      reads.push(ref);
      if (failing.includes(ref.source)) return Promise.reject(new Error('Unreadable'));
      return Promise.resolve(ref.source in rows ? { text: rows[ref.source]! } : undefined);
    };
    return { reads, read };
  }

  it('is every photo whose journal holds drafts, whatever its role', async () => {
    const images = [
      { id: 'reference', role: 'reference' as const },
      { id: 'main', role: 'mapping' as const },
      { id: 'detail', role: 'mapping' as const },
      { id: 'plain', role: 'mapping' as const },
    ];
    const { reads, read } = journals({
      reference: text(undone),
      main: text(undone),
      detail: text(undone),
      plain: text([]),
    });
    expect(await draftPhotos(read, scope, images)).toEqual(
      new Set(['reference', 'main', 'detail']),
    );
    // Every photo is read, the "Reference only" one too: it can hold drafts it hides.
    expect(reads).toEqual(images.map(({ id }) => ({ ...scope, source: id })));
  });

  it('is nothing without drafts or without a journal, and reads nothing without photos', async () => {
    const images = surface().images;
    expect(await draftPhotos(journals({ main: text([]) }).read, scope, images)).toEqual(new Set());
    expect(await draftPhotos(journals({}).read, scope, images)).toEqual(new Set());
    const { reads, read } = journals({ main: text(undone) });
    expect(await draftPhotos(read, scope, [])).toEqual(new Set());
    expect(reads).toEqual([]);
  });

  it('counts an unreadable or invalid journal as none, and still reads the others', async () => {
    const images = surface().images;
    const { read } = journals({ main: text(undone), detail: '{"version":2}' }, ['main']);
    expect(await draftPhotos(read, scope, images)).toEqual(new Set());
    const other = journals({ main: '{"version":2}', detail: text(undone) });
    expect(await draftPhotos(other.read, scope, images)).toEqual(new Set(['detail']));
  });
});

describe('draftBlocks (#72, #75)', () => {
  const images = [
    { id: 'early', role: 'reference' as const },
    { id: 'earlier', role: 'reference' as const },
    { id: 'main', role: 'mapping' as const },
    { id: 'detail', role: 'mapping' as const },
    { id: 'late', role: 'reference' as const },
  ];
  const blocks = (drafts: string[], list = images) =>
    Object.fromEntries(draftBlocks(list, new Set(drafts)));

  it('blocks the reference and the role of every photo before it while it has drafts', () => {
    expect(blocks(['main'])).toEqual({
      early: { role: true },
      earlier: { role: true },
      main: { remove: 'pending', role: true },
    });
  });

  it('blocks only removing a photo whose drafts are hidden, wherever it is listed', () => {
    expect(blocks(['detail'])).toEqual({ detail: { remove: 'hidden' } });
    expect(blocks(['late', 'early'])).toEqual({
      early: { remove: 'hidden' },
      late: { remove: 'hidden' },
    });
    // Before a reference with drafts: its role waits for those drafts, its removal for its own.
    expect(blocks(['main', 'early', 'detail'])).toEqual({
      early: { remove: 'hidden', role: true },
      earlier: { role: true },
      main: { remove: 'pending', role: true },
      detail: { remove: 'hidden' },
    });
  });

  it('blocks nothing without drafts, and nothing pending without a mapping photo', () => {
    expect(blocks([])).toEqual({});
    const unmapped = images.map((image) => ({ ...image, role: 'reference' as const }));
    expect(blocks(['main'], unmapped)).toEqual({ main: { remove: 'hidden' } });
    // The first mapping photo is the reference, not the first photo.
    expect(blocks(['early'], [{ id: 'early', role: 'mapping' }, ...images.slice(1)])).toEqual({
      early: { remove: 'pending', role: true },
    });
  });
});
