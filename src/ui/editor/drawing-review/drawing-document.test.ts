import { expect, it } from 'vitest';
import { measuredAssessments } from '../../../../tests-platform/fixtures/measured-assessment';
import { commitDrawing } from '../../../platform/projects/drawing-state';
import { newPlanarSurface } from '../../../platform/projects/planar-state';
import { restoreLayers, restoreMark, storedLayers, storedMark } from './drawing-document';

it('round-trips empty and partially assessed drawing layers without discarding masks', () => {
  const source = { id: 'photo', width: 200, height: 100, embeddedPreview: false };
  const empty = newPlanarSurface(source);
  const partial = measuredAssessments(source.id).current;
  delete partial.calibration;
  for (const state of [empty, partial]) {
    const reopened = restoreLayers(state);
    const saved = commitDrawing(state, storedLayers(reopened, state.source));
    expect(saved.master).toEqual(state.master);
    expect(saved.layers).toEqual(state.layers);
    expect(saved.categories).toEqual(state.categories);
    expect(saved.calibration).toEqual(state.calibration);
    expect(restoreLayers(saved)).toEqual(reopened);
  }
});

it('keeps a mark tolerance in source pixels and leaves legacy marks without one', () => {
  const source = { id: 'photo', width: 8000, height: 4000, embeddedPreview: false };
  const mark = {
    id: 3,
    action: 'stroke' as const,
    points: [{ x: 10, y: 20 }],
    closed: false,
    operation: 'add' as const,
    width: 2,
    region: [
      [0, 0],
      [8000, 0],
      [8000, 4000],
    ] as const,
  };
  const stored = storedMark({ ...mark, tolerance: 0.25 }, source);
  expect(stored.tolerance).toBe(0.25);
  expect(stored.width).toBe(160);
  expect(restoreMark(stored, source).tolerance).toBe(0.25);
  expect('tolerance' in storedMark(mark, source)).toBe(false);
});
