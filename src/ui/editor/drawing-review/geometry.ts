import type { Mark, Point, Shape } from './types';

export const clamp = (value: number, low = 0, high = 100) => Math.max(low, Math.min(high, value));
export const round = (value: number) => Math.round(value * 10) / 10;

export function shapePoints(shape: Shape, points: Point[]): Point[] {
  const [a, b] = points;
  if (shape === 'polygon' || !a || !b) return points;
  const x = (a.x + b.x) / 2;
  const y = (a.y + b.y) / 2;
  if (shape === 'ellipse')
    return [
      { x, y: a.y, handle: { x: b.x, y: a.y } },
      { x: b.x, y, handle: b },
      { x, y: b.y, handle: { x: a.x, y: b.y } },
      { x: a.x, y, handle: a },
    ];
  return [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }];
}

export function pathData(mark: Pick<Mark, 'points' | 'closed'>, ratio: number) {
  const [first, ...rest] = mark.points;
  if (!first) return '';
  const at = (point: Point) => `${point.x} ${point.y * ratio}`;
  const segment = (from: Point, to: Point) =>
    from.handle ? `Q ${at(from.handle)} ${at(to)}` : `L ${at(to)}`;
  const segments = rest.map((point, index) => segment(mark.points[index]!, point));
  if (mark.closed) segments.push(segment(mark.points.at(-1)!, first), 'Z');
  if (!segments.length) segments.push(segment(first, { ...first, x: first.x + 0.001 }));
  return `M ${at(first)} ${segments.join(' ')}`;
}
