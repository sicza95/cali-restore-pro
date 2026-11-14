import {
  assertBounds,
  assertTransform,
  extent,
  inside,
  inverse,
  multiply,
  preparationMatrix,
  project,
  rect,
  shift,
} from './planar-transform';
import type {
  Alignment,
  AlignmentInput,
  Matrix,
  PhotoPreparation,
  PlanarSurface,
  Point,
} from './planar-types';

export function fitSimilarity(a: Point, b: Point, c: Point, d: Point): Matrix {
  const x = b[0] - a[0];
  const y = b[1] - a[1];
  const u = d[0] - c[0];
  const v = d[1] - c[1];
  const norm = x * x + y * y;
  if (norm <= 1e-12 || u * u + v * v <= 1e-12)
    throw new Error('Distinct alignment landmarks required');
  const p = (x * u + y * v) / norm;
  const q = (x * v - y * u) / norm;
  return [p, -q, c[0] - p * a[0] + q * a[1], q, p, c[1] - q * a[0] - p * a[1], 0, 0, 1];
}

export function fitDetail(state: PlanarSurface, input: AlignmentInput, detail: PhotoPreparation) {
  if (input.method === 'reference') return;
  if (!['manual', 'automatic'].includes(input.method) || input.pairs.length !== 2)
    throw new Error('Two alignment landmarks are required');
  assertBounds(input.usable, detail.source);
  const [a, b] = input.pairs;
  const reference = state.frame;
  const prepared = preparationMatrix(detail.source, detail.input);
  const target = preparationMatrix(reference.source, reference.input);
  if (
    ![a!, b!].every(
      (p) => inside(p.detail, detail.input.crop) && inside(p.reference, reference.input.crop),
    )
  )
    throw new Error('Alignment landmarks must lie inside their crops');
  const correction = fitSimilarity(
    project(prepared, a!.detail),
    project(prepared, b!.detail),
    project(target, a!.reference),
    project(target, b!.reference),
  );
  const matrix = multiply(shift(...input.offset), multiply(correction, prepared));
  assertTransform(matrix, rect(input.usable));
  return multiply(inverse(target), matrix);
}

export function detailMapping(
  state: PlanarSurface,
  alignment: Alignment,
  detail: PhotoPreparation,
) {
  if (
    !alignment.canonical ||
    alignment.input.method === 'reference' ||
    alignment.preparationRevision !== detail.revision
  )
    return;
  return multiply(preparationMatrix(state.source, state.frame.input), alignment.canonical);
}

export function currentDetailMapping(state: PlanarSurface, detail: PhotoPreparation, point: Point) {
  const alignment = state.alignments.find((item) => item.source.id === detail.source.id);
  if (
    !alignment ||
    alignment.input.method === 'reference' ||
    !alignment.canonical ||
    alignment.preparationRevision !== detail.revision ||
    !inside(point, alignment.input.usable) ||
    !inside(point, detail.input.crop)
  )
    return;
  // The accepted mapping is anchored in the immutable main source frame.
  const canonical = project(alignment.canonical, point);
  if (inside(canonical, state.frame.input.crop) && inside(canonical, extent(state.source)))
    return canonical;
}
