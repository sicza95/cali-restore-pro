import { distance } from './drawing-viewport';
import type { Point } from './types';

export function drawingGestureHistory(step: (redo: boolean) => void) {
  const origins = new Map<number, Point>();
  let start = 0;
  let lastTap = 0;
  let fingers = 0;
  let rapidUntil = 0;
  let moved = false;
  const reset = () => {
    origins.clear();
    lastTap = fingers = rapidUntil = 0;
  };
  return {
    reset,
    start(id: number, point: Point, active: number, time: number) {
      if (active === 1) {
        origins.clear();
        start = time;
        moved = false;
      }
      if (origins.size !== active - 1) moved = true;
      origins.set(id, point);
    },
    move(id: number, point: Point) {
      const origin = origins.get(id);
      if (origin && distance(origin, point) > 12) moved = true;
    },
    finish(active: number, time: number, cancelled: boolean) {
      if (cancelled) moved = true;
      if (active) return;
      const count = origins.size;
      origins.clear();
      if (moved || time - start > 250 || (count !== 2 && count !== 3)) {
        lastTap = fingers = rapidUntil = 0;
        return;
      }
      if (time < rapidUntil || (count === fingers && time - lastTap <= 350)) {
        step(count === 3);
        rapidUntil = time + 650;
      }
      lastTap = time;
      fingers = count;
    },
  };
}
