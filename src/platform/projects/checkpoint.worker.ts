import { checkpointCoverage, checkpointDifference } from './planar-drawing';
import { measurePlanar } from './planar-measurement';
import type { PlanarSurface } from './planar-types';

export function checkpointComparison(primary: PlanarSurface, other?: PlanarSurface) {
  const coverage = checkpointCoverage(primary);
  const otherCoverage = other && checkpointCoverage(other);
  return {
    primary: measurePlanar(primary, 0),
    other: other && measurePlanar(other, 0),
    coverage,
    otherCoverage,
    difference: otherCoverage && checkpointDifference(coverage, otherCoverage),
  };
}
export type CheckpointComparison = ReturnType<typeof checkpointComparison>;

self.onmessage = (event: MessageEvent<{ primary: PlanarSurface; other?: PlanarSurface }>) => {
  try {
    self.postMessage(checkpointComparison(event.data.primary, event.data.other));
  } catch {
    self.postMessage(null);
  }
};
