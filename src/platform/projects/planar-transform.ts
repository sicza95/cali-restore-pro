import type { Bounds, Matrix, Point, Preparation, Ring, SourceFrame } from './planar-types';

export const identity: Matrix = [1, 0, 0, 0, 1, 0, 0, 0, 1];
export const rect = ([x, y, w, h]: Bounds): Ring => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h],
];
export const extent = (source: SourceFrame): Bounds => [0, 0, source.width, source.height];

export function multiply(a: Matrix, b: Matrix): Matrix {
  const entry = (r: number, c: number) =>
    a[r]! * b[c]! + a[r + 1]! * b[c + 3]! + a[r + 2]! * b[c + 6]!;
  return [
    entry(0, 0),
    entry(0, 1),
    entry(0, 2),
    entry(3, 0),
    entry(3, 1),
    entry(3, 2),
    entry(6, 0),
    entry(6, 1),
    entry(6, 2),
  ];
}
export const shift = (x: number, y: number): Matrix => [1, 0, x, 0, 1, y, 0, 0, 1];

export function inverse([a, b, c, d, e, f, g, h, i]: Matrix): Matrix {
  const adj: Matrix = [
    e * i - f * h,
    c * h - b * i,
    b * f - c * e,
    f * g - d * i,
    a * i - c * g,
    c * d - a * f,
    d * h - e * g,
    b * g - a * h,
    a * e - b * d,
  ];
  const terms = [a * adj[0], b * adj[3], c * adj[6]];
  const determinant = terms[0]! + terms[1]! + terms[2]!;
  if (
    !Number.isFinite(determinant) ||
    Math.abs(determinant) <= 1e-12 * terms.reduce((s, t) => s + Math.abs(t), 0)
  )
    throw new Error('Singular transform');
  return adj.map((item) => item / determinant) as unknown as Matrix;
}

export function project([a, b, c, d, e, f, g, h, i]: Matrix, [x, y]: Point): Point {
  const w = g * x + h * y + i;
  const result: Point = [(a * x + b * y + c) / w, (d * x + e * y + f) / w];
  if (!result.every(Number.isFinite)) throw new Error('Invalid projected point');
  return result;
}

export function assertTransform(matrix: Matrix, domain: Ring) {
  inverse(matrix);
  const [, , , , , , g, h, i] = matrix;
  if (matrix.length !== 9 || !matrix.every(Number.isFinite) || !domain.length)
    throw new Error('Invalid transform');
  const w = domain.map(([x, y]) => g * x + h * y + i);
  const limit = Math.max(...w.map(Math.abs)) * 1e-9;
  if (!w.every((value) => value > limit) && !w.every((value) => value < -limit))
    throw new Error('Projective horizon intersects the domain');
  domain.forEach((point) => project(matrix, point));
}

export function assertBounds([x, y, w, h]: Bounds, source: SourceFrame) {
  if (
    ![x, y, w, h].every(Number.isFinite) ||
    x < 0 ||
    y < 0 ||
    w <= 0 ||
    h <= 0 ||
    x + w > source.width + 1e-9 ||
    y + h > source.height + 1e-9
  )
    throw new Error('Invalid crop bounds');
}

export function defaultPreparation(source: SourceFrame): Preparation {
  return {
    crop: extent(source),
    rotation: 0,
    skew: 0,
    flip: false,
    perspective: 0,
    rectify: false,
  };
}

export function preparationMatrix(source: SourceFrame, input: Preparation): Matrix {
  assertBounds(input.crop, source);
  if (
    !Number.isFinite(input.rotation) ||
    Math.abs(input.rotation) > 180 ||
    !Number.isFinite(input.skew) ||
    Math.abs(input.skew) > 45 ||
    !Number.isFinite(input.perspective) ||
    Math.abs(input.perspective) > 45 ||
    typeof input.flip !== 'boolean' ||
    typeof input.rectify !== 'boolean'
  )
    throw new Error('Invalid preparation');
  const rad = Math.PI / 180;
  const angle = input.rotation * rad;
  const skew = Math.tan(input.skew * rad);
  const tilt = input.perspective * rad;
  const flip = input.flip ? -1 : 1;
  const [x, y, w, h] = input.crop;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const rotate: Matrix = [
    Math.cos(angle),
    -Math.sin(angle),
    0,
    Math.sin(angle),
    Math.cos(angle),
    0,
    0,
    0,
    1,
  ];
  const shear: Matrix = [flip, skew, 0, 0, 1, 0, 0, 0, 1];
  // A horizontal camera tilt centered on the target crop, or its inverse for rectification.
  const camera: Matrix = [Math.cos(tilt), 0, 0, 0, 1, 0, Math.sin(tilt) / (2 * source.width), 0, 1];
  const matrix = multiply(
    shift(cx, cy),
    multiply(
      rotate,
      multiply(input.rectify ? inverse(camera) : camera, multiply(shear, shift(-cx, -cy))),
    ),
  );
  assertTransform(matrix, rect(extent(source)));
  return matrix;
}

export function polygonBounds(ring: Ring): Bounds {
  const xs = ring.map((p) => p[0]);
  const ys = ring.map((p) => p[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return [x, y, Math.max(...xs) - x, Math.max(...ys) - y];
}

export function inside([x, y]: Point, [l, t, w, h]: Bounds) {
  return Number.isFinite(x) && Number.isFinite(y) && x >= l && x <= l + w && y >= t && y <= t + h;
}
