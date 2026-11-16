import { describe, expect, it } from 'vitest';
import { newPlanarSurface } from './planar-state';
import { changeSurfaceImages, updateSurfaceImages } from './surface-attachments';
import { emptyJournal, journalHead } from './surface-journal';
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
