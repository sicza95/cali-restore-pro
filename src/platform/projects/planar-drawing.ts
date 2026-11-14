import clipping from 'polygon-clipping';
import type { MultiPolygon, Pair, Ring as ClipRing } from 'polygon-clipping';
import { assertMask, flattenCenterline, maxEdges } from './planar-mask';
import { extent, rect } from './planar-transform';
import type { Mask, Point, Ring, SourceFrame } from './planar-types';

export type DrawingPoint = { at: Point; handle?: Point; pressure?: number };
export type DrawingMark = {
  id: number;
  action: 'stroke' | 'erase' | 'path' | 'shape';
  points: DrawingPoint[];
  closed: boolean;
  operation: 'add' | 'subtract' | 'replace';
  width: number;
  region: Ring;
};
export type DrawingLayer = {
  id: number;
  key?: string;
  kind: 'master' | 'damage' | 'phase' | 'folder';
  name: string;
  parent: number;
  visible: boolean;
  locked: boolean;
  expanded: boolean;
  opacity: number;
  color: string;
  fill: 'solid' | 'hatch' | 'none';
  outline: boolean;
  base?: Mask;
  marks: DrawingMark[];
};

const asRing = (ring: Ring): ClipRing => ring.map(([x, y]) => [x, y]);
const polygon = (ring: Ring): MultiPolygon => [[asRing(ring)]];
const count = (shape: MultiPolygon) =>
  shape.reduce((sum, rings) => sum + rings.reduce((n, ring) => n + ring.length - 1, 0), 0);
function bounded(shape: MultiPolygon) {
  if (count(shape) > maxEdges) throw new Error('Drawing exceeds mask geometry budget');
  return shape;
}

// Legacy masks can contain overlapping rings with any signed winding multiplicity.
function legacy(mask: Mask): MultiPolygon {
  let bands = new Map<number, MultiPolygon>();
  for (const ring of mask) {
    let remainder = polygon(ring);
    const direction = Math.sign(
      ring.reduce((sum, [x, y], i) => {
        const [u, v] = ring[(i + 1) % ring.length]!;
        return sum + x * v - y * u;
      }, 0),
    );
    if (!direction) throw new Error('Legacy mask needs a nondegenerate boundary to edit');
    const next = new Map<number, MultiPolygon>();
    const merge = (winding: number, area: MultiPolygon) => {
      if (winding && area.length)
        next.set(winding, bounded(clipping.union(next.get(winding) ?? [], area)));
    };
    for (const [winding, area] of bands) {
      merge(winding, clipping.difference(area, polygon(ring)));
      merge(winding + direction, clipping.intersection(area, polygon(ring)));
      remainder = clipping.difference(remainder, area);
    }
    merge(direction, remainder);
    bands = next;
    if ([...bands.values()].reduce((total, area) => total + count(area), 0) > maxEdges)
      throw new Error('Legacy mask exceeds geometry budget');
  }
  return bounded(clipping.union([], ...bands.values()));
}

const sides = 16;
const unitCircle = Array.from({ length: sides }, (_, i): Point => {
  const angle = (i * 2 * Math.PI) / sides;
  return [Math.cos(angle), Math.sin(angle)];
});

function cap([x, y]: Point, radius: number): Pair[] {
  return unitCircle.map(([u, v]) => [x + radius * u, y + radius * v]);
}

function hull(points: Pair[]): Pair[] {
  const sorted = points.sort(([x, y], [u, v]) => x - u || y - v);
  const half = (sequence: Pair[]) => {
    const result: Pair[] = [];
    for (const point of sequence) {
      while (result.length >= 2) {
        const [ax, ay] = result.at(-2)!;
        const [bx, by] = result.at(-1)!;
        if ((bx - ax) * (point[1] - ay) - (by - ay) * (point[0] - ax) > 0) break;
        result.pop();
      }
      result.push(point);
    }
    return result.slice(0, -1);
  };
  return [...half(sorted), ...half(sorted.reverse())];
}

function footprint(mark: DrawingMark): MultiPolygon {
  const [first] = mark.points;
  if (!first) return [];
  const points = mark.closed ? [...mark.points, first] : mark.points;
  const tolerance = 0.25;
  const segments = points.slice(1).map((point, i) => {
    const { at, handle } = points[i]!;
    const toward = (end: Point): Point => [
      end[0] + ((handle![0] - end[0]) * 2) / 3,
      end[1] + ((handle![1] - end[1]) * 2) / 3,
    ];
    return handle
      ? { to: point.at, controls: [toward(at), toward(point.at)] as const }
      : { to: point.at };
  });
  const line = flattenCenterline(first.at, segments, tolerance);
  if (mark.closed) return bounded(clipping.union(polygon(line)));
  const pressure = mark.points.some((point) => point.pressure !== undefined);
  const ends = line.map((point, i) =>
    cap(point, (mark.width / 2) * (pressure ? (mark.points[i]?.pressure ?? 1) : 1)),
  );
  // Each straight interval sweeps the convex hull of its endpoint disks.
  if (ends.length === 1) return polygon(ends[0]!);
  if (ends.length * sides > maxEdges * 2) throw new Error('Stroke exceeds geometry budget');
  return bounded(
    clipping.union([], ...ends.slice(1).map((end, i) => polygon(hull([...ends[i]!, ...end])))),
  );
}

export function markFootprint(mark: DrawingMark): Mask {
  return clipping
    .intersection(footprint(mark), polygon(mark.region))
    .flatMap((poly) => poly.map((ring) => ring.slice(0, -1)));
}

export function drawMask(layer: DrawingLayer, source: SourceFrame): Mask | undefined {
  if (!layer.marks.length) return layer.base ?? (layer.kind === 'master' ? undefined : []);
  const initial =
    layer.base ??
    (layer.kind === 'master' && layer.marks[0]?.operation === 'subtract'
      ? [rect(extent(source))]
      : []);
  let mask = legacy(initial);
  for (const mark of layer.marks) {
    const domain = polygon(mark.region);
    const stamp = clipping.intersection(footprint(mark), domain);
    mask = bounded(
      mark.operation === 'subtract'
        ? clipping.difference(mask, stamp)
        : clipping.union(
            mark.operation === 'replace' ? clipping.difference(mask, domain) : mask,
            stamp,
          ),
    );
  }
  const rings = mask.flatMap((poly) => poly.map((ring) => ring.slice(0, -1)));
  assertMask(rings);
  return rings;
}
