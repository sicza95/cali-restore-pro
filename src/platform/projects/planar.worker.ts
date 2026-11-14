import { measurePlanar } from './planar-measurement';
import type { PlanarSurface } from './planar-types';

self.onmessage = (event: MessageEvent<{ state: PlanarSurface; revision: number }>) => {
  try {
    self.postMessage(measurePlanar(event.data.state, event.data.revision));
  } catch {
    self.postMessage(null);
  }
};
