import { expect, it } from 'vitest';
import { newObject, newProject, newSurface } from '../projects';
import { imageDeck } from './deck';

it('resolves a stable representative from each immediate child and stops at three unique assets', () => {
  const project = newProject('P', null, null, 'EUR');
  project.objects = ['d', 'c', 'b', 'a'].map((id) => ({
    ...newObject(id),
    id,
    surfaces: [{ ...newSurface('s'), images: [{ id: `photo-${id}`, role: 'reference' as const }] }],
  }));
  expect(imageDeck(project)).toEqual(['a', 'b', 'c'].map((id) => ({ assetId: `photo-${id}` })));
  project.objects[1]!.cover = { assetId: 'photo-a' };
  expect(imageDeck(project)).toEqual(['a', 'b', 'd'].map((id) => ({ assetId: `photo-${id}` })));
  project.cover = { assetId: 'dedicated' };
  expect(imageDeck(project)).toEqual([{ assetId: 'dedicated' }]);
});
it('does not fill a project deck from multiple grandchildren of one child; supports empty folders', () => {
  const project = newProject('P', 'O', 'S', 'EUR');
  const surface = project.objects[0]!.surfaces[0]!;
  surface.images = ['c', 'b', 'a', 'a', 'd'].map((id) => ({ id, role: 'reference' }));
  expect(imageDeck(project)).toEqual([{ assetId: 'a' }]);
  expect(imageDeck(surface)).toEqual(['a', 'b', 'c'].map((assetId) => ({ assetId })));
  surface.cover = { assetId: 'd' };
  expect(imageDeck(project.objects[0]!)).toEqual([{ assetId: 'd' }]);
  expect(imageDeck(newObject('Empty'))).toEqual([]);
  expect(imageDeck(newProject('Empty', null, null, 'EUR'))).toEqual([]);
});
