import type { Mask, PathSegment, Point, Ring } from './planar-types';

const midpoint = ([x, y]: Point, [u, v]: Point): Point => [(x + u) / 2, (y + v) / 2];

// Explicit boundary approximation in the canonical frame. Under perspective the
// resulting straight edges remain straight, while polynomial controls would not.
export function flattenPath(
  start: Point,
  segments: readonly PathSegment[],
  tolerance: number,
): Ring {
  const points = flattenCenterline(start, segments, tolerance);
  assertMask([points]);
  return points;
}

export function flattenCenterline(
  start: Point,
  segments: readonly PathSegment[],
  tolerance: number,
): Ring {
  if (!Number.isFinite(tolerance) || tolerance <= 0) throw new Error('Invalid path tolerance');
  const points = [start];
  function cubic(a: Point, b: Point, c: Point, d: Point, depth: number) {
    const deviation = (p: Point, t: number) =>
      Math.hypot(p[0] - ((1 - t) * a[0] + t * d[0]), p[1] - ((1 - t) * a[1] + t * d[1]));
    if (Math.max(deviation(b, 1 / 3), deviation(c, 2 / 3)) <= tolerance) {
      points.push(d);
      return;
    }
    if (depth >= 20 || points.length >= maxEdges) throw new Error('Path exceeds geometry budget');
    const ab = midpoint(a, b);
    const bc = midpoint(b, c);
    const cd = midpoint(c, d);
    const abc = midpoint(ab, bc);
    const bcd = midpoint(bc, cd);
    const mid = midpoint(abc, bcd);
    cubic(a, ab, abc, mid, depth + 1);
    cubic(mid, bcd, cd, d, depth + 1);
  }
  for (const segment of segments) {
    if ('controls' in segment) cubic(points.at(-1)!, ...segment.controls, segment.to, 0);
    else points.push(segment.to);
    if (points.length > maxEdges) throw new Error('Path exceeds geometry budget');
  }
  return points;
}

export const maxEdges = 4096;

export function assertMask(mask: Mask) {
  let count = 0;
  if (!Array.isArray(mask) || mask.length > maxEdges) throw new Error('Invalid mask');
  for (const ring of mask) {
    if (!Array.isArray(ring) || ring.length < 3 || (count += ring.length) > maxEdges)
      throw new Error('Invalid mask ring');
    if (
      ring.some(
        (point) => !Array.isArray(point) || point.length !== 2 || !point.every(Number.isFinite),
      )
    )
      throw new Error('Invalid mask coordinate');
  }
}

type Edge = { start: number; end: number; y: number; slope: number; mask: number; delta: number };
const yAt = (edge: Edge, x: number) => edge.y + (x - edge.start) * edge.slope;

// Between x events, edges cannot cross and each selected band has linear height.
export function coveredAreas(
  masks: readonly Mask[],
  select: (filled: readonly boolean[]) => readonly boolean[],
): number[] {
  masks.forEach(assertMask);
  const count = masks.reduce(
    (total, mask) => total + mask.reduce((sum, ring) => sum + ring.length, 0),
    0,
  );
  if (count > maxEdges) throw new Error('Combined masks exceed geometry budget');
  const result = select(masks.map(() => false)).map(() => 0);
  const compensation = result.slice();
  if (!count) return result;
  const origin = masks.find((mask) => mask.length)![0]![0]!;
  const edges: Edge[] = [];
  const events = new Set<number>();
  masks.forEach((mask, index) =>
    mask.forEach((ring) =>
      ring.forEach(([x, y], i) => {
        const [u, v] = ring[(i + 1) % ring.length]!;
        if (x === u) return;
        const delta = x < u ? 1 : -1;
        const start = Math.min(x, u) - origin[0];
        const end = Math.max(x, u) - origin[0];
        const edge = {
          start,
          end,
          y: (delta > 0 ? y : v) - origin[1],
          slope: (v - y) / (u - x),
          mask: index,
          delta,
        };
        if (![start, end, edge.y, edge.slope].every(Number.isFinite))
          throw new Error('Mask exceeds numeric range');
        edges.push(edge);
        events.add(start);
        events.add(end);
      }),
    ),
  );
  edges.sort((a, b) => a.start - b.start);
  for (let i = 0; i < edges.length; i++) {
    const a = edges[i]!;
    for (let j = i + 1; j < edges.length && edges[j]!.start < a.end; j++) {
      const b = edges[j]!;
      if (a.slope === b.slope) continue;
      const cross = b.start + (b.y - yAt(a, b.start)) / (a.slope - b.slope);
      if (cross > b.start && cross < Math.min(a.end, b.end)) events.add(cross);
      if (events.size > 65_536) throw new Error('Mask intersections exceed geometry budget');
    }
  }
  const cuts = [...events].sort((a, b) => a - b);
  let active: Edge[] = [];
  let next = 0;
  let work = 0;
  for (let i = 1; i < cuts.length; i++) {
    const left = cuts[i - 1]!;
    const right = cuts[i]!;
    const mid = left + (right - left) / 2;
    active = active.filter((edge) => edge.end > left);
    while (edges[next] && edges[next]!.start <= left) active.push(edges[next++]!);
    work += active.length * masks.length;
    if (work > 4_000_000) throw new Error('Mask integration exceeds geometry budget');
    const sorted = active
      .map((edge) => ({ edge, y: yAt(edge, mid) }))
      .sort((a, b) => a.y - b.y || a.edge.slope - b.edge.slope);
    const winding = masks.map(() => 0);
    for (let j = 1; j < sorted.length; j++) {
      const { edge, y } = sorted[j - 1]!;
      winding[edge.mask] = winding[edge.mask]! + edge.delta;
      const band = (sorted[j]!.y - y) * (right - left);
      if (!Number.isFinite(band)) throw new Error('Mask area exceeds numeric range');
      if (band === 0) continue;
      select(winding.map((value) => value !== 0)).forEach((include, k) => {
        if (!include) return;
        const difference = band - compensation[k]!;
        const total = result[k]! + difference;
        compensation[k] = total - result[k]! - difference;
        result[k] = total;
      });
    }
  }
  return result;
}
