import { expect, it } from 'vitest';
import { measuredAssessments } from '../../../../tests-platform/fixtures/measured-assessment';
import { commitDrawing } from '../../../platform/projects/drawing-state';
import { newPlanarSurface } from '../../../platform/projects/planar-state';
import { restoreLayers, storedLayers } from './drawing-document';

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
