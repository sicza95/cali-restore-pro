import { describe, expect, it } from 'vitest';
import { calibrationScale } from './planar-calibration';
import { coveredAreas, flattenCenterline, flattenPath } from './planar-mask';
import { displayArea } from './planar-measurement';
import {
  defaultPreparation,
  identity,
  inverse,
  multiply,
  polygonBounds,
  preparationMatrix,
  project,
  rect,
  shift,
} from './planar-transform';
import type { Mask, PhotoPreparation, Point, Ring, SourceFrame } from './planar-types';

const source: SourceFrame = { id: 'photo', width: 200, height: 100, embeddedPreview: false };
const frame: PhotoPreparation = { source, revision: 0, input: defaultPreparation(source) };
const reversed = (ring: Ring): Ring => [...ring].reverse();
const area = (mask: Mask) => coveredAreas([mask], ([filled]) => [!!filled])[0];

describe('coveredAreas', () => {
  it.each<[string, Mask, number]>([
    ['a 10 × 10 square', [rect([0, 0, 10, 10])], 100],
    ['the same square wound the other way', [reversed(rect([0, 0, 10, 10]))], 100],
    [
      'a 3-4-5 triangle',
      [
        [
          [0, 0],
          [4, 0],
          [0, 3],
        ],
      ],
      6,
    ],
    [
      'a diamond with 10 unit diagonals',
      [
        [
          [5, 0],
          [10, 5],
          [5, 10],
          [0, 5],
        ],
      ],
      50,
    ],
    [
      'a square with an opposite-wound 6 × 6 hole',
      [rect([0, 0, 10, 10]), reversed(rect([2, 2, 6, 6]))],
      64,
    ],
    [
      'two overlapping squares in one mask (nonzero winding)',
      [rect([0, 0, 4, 4]), rect([2, 2, 4, 4])],
      28,
    ],
    ['a square away from the origin', [rect([1000, 2000, 0.5, 0.25])], 0.125],
  ])('measures %s', (_label, mask, expected) => {
    expect(area(mask)).toBeCloseTo(expected, 9);
  });

  it('measures union and intersection across masks', () => {
    const [union, both, onlyA] = coveredAreas(
      [[rect([0, 0, 4, 4])], [rect([2, 2, 4, 4])]],
      ([a, b]) => [!!a || !!b, !!a && !!b, !!a && !b],
    );
    // 16 + 16 − 4 overlap = 28; overlap 2 × 2 = 4; A alone 16 − 4 = 12.
    expect(union).toBeCloseTo(28, 9);
    expect(both).toBeCloseTo(4, 9);
    expect(onlyA).toBeCloseTo(12, 9);
  });

  it('is zero for no geometry', () => {
    expect(coveredAreas([[], []], ([a, b]) => [!!a, !!b])).toEqual([0, 0]);
  });

  it('rejects a ring with fewer than three points', () => {
    expect(() =>
      area([
        [
          [0, 0],
          [1, 1],
        ],
      ]),
    ).toThrow('Invalid mask ring');
  });

  it('rejects non-finite coordinates', () => {
    expect(() =>
      area([
        [
          [0, 0],
          [1, 0],
          [0, Number.NaN],
        ],
      ]),
    ).toThrow('Invalid mask coordinate');
  });
});

describe('path flattening', () => {
  it('keeps straight segments as their endpoints', () => {
    const ring = flattenPath([0, 0], [{ to: [10, 0] }, { to: [10, 10] }, { to: [0, 10] }], 0.1);
    expect(ring).toEqual([
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ]);
  });

  it('adds one point for a cubic whose controls lie on the chord', () => {
    const line = flattenCenterline(
      [0, 0],
      [
        {
          to: [9, 0],
          controls: [
            [3, 0],
            [6, 0],
          ],
        },
      ],
      0.01,
    );
    expect(line).toEqual([
      [0, 0],
      [9, 0],
    ]);
  });

  it('subdivides a curved cubic until every point is within tolerance of the curve', () => {
    // Quarter circle of radius 10, standard cubic approximation (k = 0.5523).
    const k = 10 * 0.5523;
    const line = flattenCenterline(
      [10, 0],
      [
        {
          to: [0, 10],
          controls: [
            [10, k],
            [k, 10],
          ],
        },
      ],
      0.01,
    );
    expect(line.length).toBeGreaterThan(8);
    expect(line.at(-1)).toEqual([0, 10]);
    for (const [x, y] of line) expect(Math.hypot(x, y)).toBeCloseTo(10, 1);
  });

  it('rejects a non-positive tolerance', () => {
    expect(() => flattenCenterline([0, 0], [], 0)).toThrow('Invalid path tolerance');
  });
});

describe('planar transforms', () => {
  it('inverts a translation and projects points through it', () => {
    // The adjugate yields −0 for some zero entries; compare by value.
    inverse(shift(3, -4)).forEach((value, i) => expect(value).toBeCloseTo(shift(-3, 4)[i]!, 12));
    expect(project(shift(3, -4), [1, 1])).toEqual([4, -3]);
    expect(multiply(shift(1, 2), shift(-1, -2))).toEqual(identity);
  });

  it('rejects a singular matrix', () => {
    expect(() => inverse([1, 2, 0, 2, 4, 0, 0, 0, 1])).toThrow('Singular transform');
  });

  it('is the identity for the default preparation', () => {
    const matrix = preparationMatrix(source, defaultPreparation(source));
    matrix.forEach((value, i) => expect(value).toBeCloseTo(identity[i]!, 12));
  });

  it('rotates 90° about the crop centre', () => {
    const square: SourceFrame = { ...source, width: 100, height: 100 };
    const matrix = preparationMatrix(square, { ...defaultPreparation(square), rotation: 90 });
    // Top centre (50, 0) is 50 above the centre (50, 50); a 90° turn puts it 50 to the right.
    const [x, y] = project(matrix, [50, 0]);
    expect(x).toBeCloseTo(100, 9);
    expect(y).toBeCloseTo(50, 9);
  });

  it('bounds a polygon', () => {
    const ring: Point[] = [
      [3, 7],
      [-2, 4],
      [5, -1],
    ];
    expect(polygonBounds(ring)).toEqual([-2, -1, 7, 8]);
  });

  it('rejects a crop outside the photo', () => {
    expect(() =>
      preparationMatrix(source, { ...defaultPreparation(source), crop: [150, 0, 100, 100] }),
    ).toThrow('Invalid crop bounds');
  });
});

describe('calibrationScale', () => {
  it('maps whole-crop dimensions to metres per pixel', () => {
    // 2 m over 200 px and 1 m over 100 px → 0.01 m per pixel on both axes.
    const [x, y] = calibrationScale(frame, {
      method: 'dimensions',
      unit: 'm',
      width: 2,
      height: 1,
    });
    expect(x).toBeCloseTo(0.01, 12);
    expect(y).toBeCloseTo(0.01, 12);
  });

  it('uses the drawn reference lines and their unit', () => {
    // 50 cm over a 100 px line and 25 cm over a 50 px line → 0.005 m per pixel.
    const [x, y] = calibrationScale(frame, {
      method: 'lines',
      unit: 'cm',
      width: 50,
      height: 25,
      horizontal: [
        [10, 10],
        [110, 10],
      ],
      vertical: [
        [10, 10],
        [10, 60],
      ],
    });
    expect(x).toBeCloseTo(0.005, 12);
    expect(y).toBeCloseTo(0.005, 12);
  });

  it('converts inches', () => {
    // 100 in = 2.54 m over 200 px → 0.0127 m per pixel.
    const [x] = calibrationScale(frame, {
      method: 'dimensions',
      unit: 'in',
      width: 100,
      height: 1,
    });
    expect(x).toBeCloseTo(0.0127, 12);
  });

  it('rejects missing lengths, endpoints outside the crop and zero spans', () => {
    expect(() =>
      calibrationScale(frame, { method: 'dimensions', unit: 'm', width: 0, height: 1 }),
    ).toThrow('Both calibration lengths are required');
    const lines = {
      method: 'lines',
      unit: 'm',
      width: 1,
      height: 1,
      vertical: [
        [0, 0],
        [0, 50],
      ],
    } as const;
    expect(() =>
      calibrationScale(frame, {
        ...lines,
        horizontal: [
          [0, 0],
          [250, 0],
        ],
      }),
    ).toThrow('inside the crop');
    expect(() =>
      calibrationScale(frame, {
        ...lines,
        horizontal: [
          [5, 0],
          [5, 40],
        ],
      }),
    ).toThrow('Calibration axis has no span');
  });
});

describe('displayArea', () => {
  it.each([
    [1, 'm', 1],
    [1, 'cm', 10_000],
    [1, 'mm', 1_000_000],
    [0.09290304, 'ft', 1],
    [0.00064516, 'in', 1],
  ] as const)('%d m² is %d %s²', (areaM2, unit, expected) => {
    expect(displayArea(areaM2, unit)).toBeCloseTo(expected, 9);
  });
});
