import { describe, expect, it } from 'vitest';
import { newPlanarSurface } from './planar-state';
import { updateSurfaceImages } from './surface-attachments';
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
