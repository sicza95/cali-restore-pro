import { expect, test } from '@playwright/test';
import { drawMask, markFootprint } from '../src/platform/projects/planar-drawing';
import type { DrawingLayer, DrawingMark } from '../src/platform/projects/planar-drawing';
import { coveredAreas } from '../src/platform/projects/planar-mask';
import { measurePlanar } from '../src/platform/projects/planar-measurement';
import { commitDrawing } from '../src/platform/projects/drawing-state';
import { newPlanarSurface, preparePhoto } from '../src/platform/projects/planar-state';
import { defaultPreparation, rect } from '../src/platform/projects/planar-transform';
import type { Bounds, Mask } from '../src/platform/projects/planar-types';

const source = { id: 'wall', width: 200, height: 100, embeddedPreview: false };
const region = rect([0, 0, 200, 100]);
const shape = (
  id: number,
  bounds: Bounds,
  operation: DrawingMark['operation'] = 'add',
): DrawingMark => ({
  id,
  action: 'shape',
  points: rect(bounds).map((at) => ({ at })),
  closed: true,
  operation,
  width: 2,
  region,
});
const layer = (id: number, marks: DrawingMark[] = []): DrawingLayer => ({
  id,
  marks,
  kind: id === 1 ? 'master' : 'damage',
  parent: 0,
  name: '',
  visible: true,
  locked: false,
  expanded: true,
  opacity: 0,
  color: '#000000',
  fill: 'none',
  outline: false,
});
const area = (mask: Mask) => coveredAreas([mask], (filled) => filled)[0];

test('drawing unions overlaps, erases holes and replaces only within the authoring region', () => {
  const first = shape(3, [10, 10, 80, 50]);
  const second = shape(4, [50, 10, 80, 50]);
  const hole = shape(5, [60, 20, 20, 30], 'subtract');
  const mask = layer(2, [first, second, hole]);
  expect(area(drawMask(mask, source)!)).toBe(5_400);
  const local = rect([50, 0, 150, 100]);
  const replacement = { ...shape(6, [100, 10, 40, 40], 'replace'), region: local };
  const state = commitDrawing(newPlanarSurface(source), [
    layer(1),
    { ...mask, marks: [...mask.marks, replacement] },
  ]);
  expect(measurePlanar(state, 1).damage.pixels2).toBe(3_600);
  const cropped = preparePhoto(state, source, {
    ...defaultPreparation(source),
    crop: [0, 0, 80, 100],
  });
  expect(measurePlanar(cropped, 2).damage.pixels2).toBe(2_000);
  const reopened = preparePhoto(cropped, source, defaultPreparation(source));
  expect(measurePlanar(reopened, 3).damage.pixels2).toBe(3_600);
  expect(reopened.drawing).toEqual(state.drawing);
});

test('open paths and pressure strokes produce filled, width-dependent footprints', () => {
  const mark: DrawingMark = {
    id: 3,
    action: 'stroke',
    operation: 'add',
    closed: false,
    width: 10,
    region,
    points: [{ at: [30, 30] }, { at: [90, 30] }],
  };
  const constant = area(markFootprint(mark))!;
  expect(constant).toBeCloseTo(600 + 8 * 25 * Math.sin(Math.PI / 8), 8);
  const narrow = { ...mark, points: [{ at: [30, 30] as const, pressure: 0.25 }, mark.points[1]!] };
  expect(area(markFootprint(narrow))).toBeLessThan(constant);
  expect(area(markFootprint({ ...mark, points: [mark.points[0]!] }))).toBeCloseTo(
    constant - 600,
    8,
  );
  const master = drawMask(layer(1, [{ ...mark, operation: 'subtract' }]), source);
  expect(area(master!)).toBeCloseTo(20_000 - constant, 8);
});
