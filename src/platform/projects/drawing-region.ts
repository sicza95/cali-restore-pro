import clipping from 'polygon-clipping';
import { photoFrame, sameSource } from './planar-state';
import { assertTransform, extent, inverse, project, rect } from './planar-transform';
import type { Matrix, PlanarSurface, Ring, SourceFrame } from './planar-types';

export function drawingFrame(
  state: PlanarSurface,
  source: SourceFrame,
): { toCanonical?: Matrix; region?: Ring } {
  if (sameSource(source, state.source)) return { region: rect(state.frame.input.crop) };
  const detail = state.details.find((row) => sameSource(source, row.source)) ?? photoFrame(source);
  const alignment = state.alignments.find((row) => sameSource(source, row.source));
  if (
    !alignment?.canonical ||
    alignment.input.method === 'reference' ||
    alignment.preparationRevision !== detail.revision
  )
    return {};
  const matrix = alignment.canonical;
  const [x, y, w, h] = detail.input.crop;
  const [u, v, a, b] = alignment.input.usable;
  const left = Math.max(x, u);
  const top = Math.max(y, v);
  const right = Math.min(x + w, u + a);
  const bottom = Math.min(y + h, v + b);
  if (right <= left || bottom <= top) return {};
  const domain = rect([left, top, right - left, bottom - top]);
  const clipRing = (ring: Ring): [number, number][] => ring.map(([x, y]) => [x, y]);
  assertTransform(matrix, domain);
  const [[ring] = []] = clipping.intersection(
    [clipRing(domain.map((point) => project(matrix, point)))],
    [clipRing(rect(state.frame.input.crop))],
  );
  return { toCanonical: matrix, region: ring?.slice(0, -1) };
}

export function drawingProjection(frame: ReturnType<typeof drawingFrame>, source: SourceFrame) {
  if (!frame.toCanonical) return undefined;
  const matrix = inverse(frame.toCanonical);
  try {
    // The visible main raster must have a finite inverse in the detail view.
    assertTransform(matrix, rect(extent(source)));
    return matrix;
  } catch {
    return undefined;
  }
}
