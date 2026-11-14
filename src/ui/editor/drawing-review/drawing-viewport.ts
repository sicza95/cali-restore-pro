import { clamp } from './geometry';
import type { Point } from './types';

export const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
export const center = ([a, b = a]: Point[]): Point => ({
  x: (a!.x + b!.x) / 2,
  y: (a!.y + b!.y) / 2,
});

export function viewTransform(
  offset: Point,
  zoom: number,
  next: number,
  from: Point,
  to: Point,
  box: DOMRect,
  size: Point,
): Point {
  const factor = next / zoom;
  const limit = (next - 1) * 50;
  const translate = (axis: 'x' | 'y', origin: number) =>
    clamp(
      offset[axis] +
        ((to[axis] - from[axis] + (from[axis] - origin) * (1 - factor)) / size[axis]) * 100,
      -limit,
      limit,
    );
  return {
    x: translate('x', box.left + box.width / 2),
    y: translate('y', box.top + box.height / 2),
  };
}
