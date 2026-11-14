import { captureCheckpoint } from '../../src/platform/projects/assessment-checkpoints';
import { commitDrawing } from '../../src/platform/projects/drawing-state';
import type { DrawingLayer } from '../../src/platform/projects/planar-drawing';
import { calibrate, newPlanarSurface } from '../../src/platform/projects/planar-state';
import { rect } from '../../src/platform/projects/planar-transform';

export function measuredAssessments(id: string) {
  const layer = (id: number, kind: DrawingLayer['kind'], name: string): DrawingLayer => ({
    id,
    kind,
    name,
    parent: 0,
    visible: true,
    locked: false,
    expanded: true,
    opacity: 100,
    color: '#9c4138',
    fill: 'solid',
    outline: false,
    marks: [],
  });
  const start = calibrate(
    newPlanarSurface({ id, width: 200, height: 100, embeddedPreview: false }),
    { method: 'dimensions', unit: 'm', width: 4, height: 2 },
  );
  const first = commitDrawing(start, [
    layer(1, 'master', 'Assessed extent'),
    { ...layer(2, 'damage', 'Pigment loss'), base: [rect([0, 0, 50, 100])] },
    {
      ...layer(3, 'phase', 'Cleaning scope'),
      base: [rect([0, 0, 100, 100])],
      color: '#316783',
      fill: 'hatch',
      pattern: {
        id: '00000000-0000-4000-8000-000000000001',
        name: 'Saved dots',
        version: 1,
        tile: {
          kind: 'dots',
          spacing: 20,
          size: 5,
          weight: 1,
          angle: 30,
          color: '#316783',
          motif: '',
        },
      },
    },
    {
      ...layer(4, 'damage', 'Hidden layer'),
      visible: false,
      color: '#abcdef',
      base: [rect([25, 0, 25, 100])],
    },
  ]);
  const checkpoint = captureCheckpoint('Initial on-site survey', first);
  const current = commitDrawing(
    first,
    first.drawing!.map((row) =>
      row.id === 3
        ? { ...row, base: [rect([0, 0, 150, 100])] }
        : row.id === 2
          ? { ...row, base: [rect([0, 0, 100, 100])] }
          : row,
    ),
  );
  return { current, checkpoint };
}
