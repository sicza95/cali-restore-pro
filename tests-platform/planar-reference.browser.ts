import { expect, test } from '@playwright/test';
import { coveredAreas, flattenPath } from '../src/platform/projects/planar-mask';
import { currentDetailMapping, detailMapping } from '../src/platform/projects/planar-alignment';
import { proposePlanarMatch } from '../src/platform/projects/planar-match';
import {
  displayArea,
  measurePlanar,
  resultStatus,
} from '../src/platform/projects/planar-measurement';
import {
  acceptDetail,
  calibrate,
  newPlanarSurface,
  photoFrame,
  preparePhoto,
  replaceMasks,
} from '../src/platform/projects/planar-state';
import {
  assertTransform,
  defaultPreparation,
  inverse,
  preparationMatrix,
  project,
  rect,
} from '../src/platform/projects/planar-transform';
import type { Bounds, Mask, Matrix, Point, Ring } from '../src/platform/projects/planar-types';
import geometry from './planar-fixtures/geometry.json' with { type: 'json' };
import mapping from './planar-fixtures/mapping.json' with { type: 'json' };
import units from './planar-fixtures/units.json' with { type: 'json' };

const number = (value: string | number) => {
  const [n, d = '1'] = String(value).split('/');
  return Number(n) / Number(d);
};
const points = (rows: string[][]) => rows.map(([x, y]) => [number(x!), number(y!)] as const);
const box = (row: string[]) => {
  const [left, top, right, bottom] = row.map(number);
  return rect([left!, top!, right! - left!, bottom! - top!]);
};
const area = (mask: Mask) => coveredAreas([mask], (bits) => bits)[0]!;
const source = { id: 'original', width: 1600, height: 1200, embeddedPreview: true };

test('G-01 through G-08 match independent rational area controls', () => {
  for (const row of geometry.cases) {
    const polygons = (row.rectangles ?? []).map(box);
    const [a, b, c] = polygons;
    const expected = row.expected;
    switch (row.kind) {
      case 'rect-union': {
        const actual = coveredAreas(
          polygons.map((ring) => [ring]),
          ([l, r]) => [!!l, !!r, !!l && !!r, !!l || !!r],
        );
        expect(actual).toEqual(
          [...expected.layerAreas!, expected.intersection!, expected.union!].map(number),
        );
        break;
      }
      case 'master-crop': {
        const masks = [[box(row.master!)], [box(row.crop!)], row.damage!.map(box)];
        const [assessed, damage, uncropped] = coveredAreas(masks, ([master, crop, filled]) => [
          !!master && !!crop,
          !!master && !!crop && !!filled,
          !!master && !!filled,
        ]);
        expect(assessed).toBe(number(expected.assessed!));
        expect(damage).toBe(number(expected.damage!));
        expect((100 * damage!) / assessed!).toBeCloseTo(number(expected.percent!), 12);
        expect(uncropped).toBe(number(expected.uncroppedDamage!));
        break;
      }
      case 'hole-island':
      case 'micro-hole-gap': {
        const mask = [a!, [...b!].reverse(), ...(c ? [c] : [])];
        expect(area(mask)).toBeCloseTo(number(expected.area!), 12);
        expect(area([mask[1]!])).toBeGreaterThan(0);
        break;
      }
      case 'narrow-gap':
        expect(area(polygons)).toBeCloseTo(number(expected.area!), 12);
        expect(b![0]![0] - a![1]![0]).toBeCloseTo(number(row.markedMinimumFeature!), 12);
        break;
      case 'cubic-arch': {
        const [p0, p1, p2, p3] = points(row.controlPoints!);
        const ring = flattenPath(
          p0!,
          [{ to: p3!, controls: [p1!, p2!] }],
          number(row.boundaryBudget!),
        );
        expect(ring.length).toBeGreaterThan(4);
        expect(Math.abs(area([ring]) - number(expected.area!))).toBeLessThan(
          number(row.areaErrorBound!),
        );
        break;
      }
      default:
        expect(area([points(row.points!)])).toBe(number((expected.area ?? expected.filledArea)!));
    }
  }
  const triangle = points(geometry.cases.find(({ id }) => id === 'G-06')!.points!);
  const transform = (ring: Ring, scale: number, [dx, dy]: Point): Ring =>
    ring.map(([x, y]) => [x * scale + dx, y * scale + dy]);
  const cases = geometry.metamorphic.scales.map((scale) => [number(scale), [0, 0]] as const);
  const [translation] = points(geometry.metamorphic.translations.slice(1));
  for (const [s, t] of [...cases, [1, translation!] as const]) {
    expect(Math.abs(area([transform(triangle, s, t)]) / s ** 2 - 0.5)).toBeLessThan(
      number(geometry.straightAreaToleranceNormalized),
    );
  }
});

test('CAL-01 through CAL-04 and S-01 through S-07 preserve physical dimensions and validity', () => {
  for (const row of geometry.calibration) {
    const state = newPlanarSurface(source);
    if (row.expectedStatus) {
      expect(measurePlanar(state, 1).assessed.areaM2.status).toBe(row.expectedStatus);
      expect(() =>
        calibrate(state, { method: 'dimensions', unit: 'm', width: 0.1, height: 0 }),
      ).toThrow();
      continue;
    }
    const mask = (width: number, height: number) =>
      replaceMasks(state, {
        layers: [],
        categories: [],
        master: [rect([0, 0, width, height])],
      });
    const calibrated =
      row.method === 'known-dimensions'
        ? calibrate(mask(source.width * number(row.coveredFraction!), source.height), {
            method: 'dimensions',
            unit: 'm',
            width: number(row.physicalMetres![0]!),
            height: number(row.physicalMetres![1]!),
          })
        : calibrate(mask(number(row.coveredPixels2!) / 100, 100), {
            method: 'lines',
            unit: 'm',
            width: number(row.horizontalMetres!),
            height: number(row.verticalMetres!),
            horizontal: [
              [0, 0],
              [number(row.horizontalPixels!), 0],
            ],
            vertical: [
              [0, 0],
              [0, number(row.verticalPixels!)],
            ],
          });
    expect(measurePlanar(calibrated, 1).assessed.areaM2.value).toBeCloseTo(
      number(row.expectedAreaM2!),
      12,
    );
    expect(displayArea(number(units.expected.oneSquareFootM2), 'ft')).toBe(1);
    expect(displayArea(number(units.expected.oneSquareInchM2), 'in')).toBeCloseTo(1, 14);
  }
  for (const row of geometry.statusCases) {
    const s = replaceMasks(newPlanarSurface({ ...source, width: 10, height: 10 }), {
      master: row.assessed === '0' ? [] : undefined,
      categories: [],
      layers:
        row.damage === '25' ? [{ id: 'damage', kind: 'damage', mask: [rect([0, 0, 5, 5])] }] : [],
    });
    const calibrated =
      row.scale === 'missing'
        ? s
        : calibrate(s, { method: 'dimensions', unit: 'm', width: 10, height: 10 });
    const state =
      row.scale === 'invalid'
        ? preparePhoto(calibrated, s.source, { ...s.frame.input, flip: true })
        : calibrated;
    const result = measurePlanar(state, 1);
    const status = resultStatus(
      row.job === 'running' ? undefined : result,
      state,
      row.revision ? 2 : 1,
      row.job === 'running' ? 'running' : row.job === 'error' ? 'error' : 'idle',
    );
    if (row.areaStatus) expect(status).toBe(row.areaStatus);
    if (row.percentStatus) expect(result.damage.percent.status).toBe(row.percentStatus);
    if ('percent' in row)
      expect(result.damage.percent.value).toBe(row.percent === null ? null : number(row.percent!));
    if ('area' in row)
      expect(result.damage.areaM2.value).toBe(row.area === null ? null : number(row.area!));
  }
});

test('FX-05 holdouts, main transform composition, partial acceptance and nested damage unions', () => {
  const detail = { ...source, id: 'detail', width: 1, height: 1 };
  const s = replaceMasks(newPlanarSurface(source), {
    master: [rect([0, 0, 100, 100])],
    categories: [{ id: 'outer' }, { id: 'inner', parent: 'outer' }],
    layers: [
      { id: 'damage-a', kind: 'damage', parent: 'inner', mask: [rect([0, 0, 5, 2])] },
      { id: 'damage-b', kind: 'damage', parent: 'outer', mask: [rect([3.5, 0, 5, 2])] },
      { id: 'treatment', kind: 'phase', parent: 'inner', mask: [rect([0, 0, 10, 10])] },
    ],
  });
  const oracle = mapping.detailToGlobal.flat().map(number) as unknown as Matrix;
  const fitted = acceptDetail(s, detail, {
    method: 'manual',
    offset: [0, 0],
    usable: [0, 0, 1, 0.75],
    pairs: points(mapping.fitPoints)
      .slice(0, 2)
      .map((point) => ({ detail: point, reference: project(oracle, point) })),
  });
  const actual = points(mapping.holdoutPoints).map((point) =>
    currentDetailMapping(fitted, photoFrame(detail), point),
  );
  points(mapping.holdoutExpected).forEach((point, i) => {
    expect(actual[i]?.[0]).toBeCloseTo(point[0], 12);
    expect(actual[i]?.[1]).toBeCloseTo(point[1], 12);
  });
  expect(currentDetailMapping(fitted, photoFrame(detail), [0.5, 0.9])).toBeUndefined();
  const { assessed, damage, categories, layers } = measurePlanar(fitted, 1);
  expect(assessed.pixels2).toBe(10_000);
  expect(damage.pixels2).toBe(17);
  expect(categories.map((item) => item.pixels2)).toEqual([17, 10]);
  expect(layers.map((item) => item.pixels2)).toEqual([10, 10, 100]);
  const moved = preparePhoto(fitted, source, {
    ...fitted.frame.input,
    rotation: 12,
    perspective: 10,
  });
  expect(moved.layers).toBe(fitted.layers);
  const check: Point = [0.5, 0.5];
  const mapped = project(detailMapping(moved, moved.alignments[0]!, photoFrame(detail))!, check);
  const projected = project(preparationMatrix(source, moved.frame.input), project(oracle, check));
  expect(mapped[0]).toBeCloseTo(projected[0], 12);
  expect(mapped[1]).toBeCloseTo(projected[1], 12);
  const cropped = preparePhoto(s, source, { ...s.frame.input, crop: [0, 0, 4, 10] });
  expect(measurePlanar(cropped, 1).damage.pixels2).toBe(8);
  const restored = preparePhoto(cropped, source, s.frame.input);
  expect(measurePlanar(restored, 1).damage.pixels2).toBe(17);
  expect(
    currentDetailMapping(
      acceptDetail(moved, detail, { method: 'reference' }),
      photoFrame(detail),
      check,
    ),
  ).toBeUndefined();
  const perspective = mapping.mainPerspective.flat().map(number) as unknown as Matrix;
  const unit: Bounds = [0, 0, 1, 1];
  expect(area([rect(unit).map((point) => project(perspective, point))])).toBeCloseTo(
    number(mapping.unitSquareExpectedTransformedArea),
    12,
  );
  expect(() => assertTransform([1, 0, 0, 0, 1, 0, 1, 0, -0.5], rect(unit))).toThrow(/horizon/);
  const photo = preparationMatrix(source, {
    ...defaultPreparation(source),
    perspective: 20,
    rectify: true,
  });
  const roundTrip = project(inverse(photo), project(photo, [100, 200]));
  expect(roundTrip[0]).toBeCloseTo(100, 10);
  expect(roundTrip[1]).toBeCloseTo(200, 10);
});

test('automatic matching finds a translated synthetic overlap and refuses a uniform image', () => {
  let seed = 42;
  const grey = Uint8Array.from(
    { length: 70 * 60 },
    () => (seed = Math.imul(seed, 1664525) + 1013904223) >>> 24,
  );
  const detail = Uint8Array.from(
    { length: 45 * 40 },
    (_, i) => grey[(Math.floor(i / 45) + 9) * 70 + (i % 45) + 11]!,
  );
  const result = proposePlanarMatch(
    { width: 45, height: 40, grey: detail },
    { width: 70, height: 60, grey },
  );
  expect(result).toHaveLength(2);
  for (const { detail, reference } of result!)
    expect([reference[0] - detail[0], reference[1] - detail[1]]).toEqual([11, 9]);
  expect(
    proposePlanarMatch(
      { width: 45, height: 40, grey: new Uint8Array(45 * 40) },
      { width: 70, height: 60, grey },
    ),
  ).toBeUndefined();
});
