import type { PlanarResult } from './planar-measurement';
import type { PlanarSurface } from './planar-types';

export function measureAssessment(
  state: PlanarSurface,
  revision: number,
  signal: AbortSignal,
): Promise<PlanarResult | null> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./planar.worker.ts', import.meta.url), { type: 'module' });
    const finish = (value: PlanarResult | null) => {
      clearTimeout(timer);
      worker.terminate();
      signal.removeEventListener('abort', abort);
      resolve(value);
    };
    const abort = () => {
      reject(signal.reason);
      finish(null);
    };
    const timer = setTimeout(() => finish(null), 10_000);
    signal.addEventListener('abort', abort, { once: true });
    worker.onmessage = ({ data }: MessageEvent<PlanarResult | null>) => finish(data);
    worker.onerror = () => finish(null);
    worker.onmessageerror = () => finish(null);
    try {
      worker.postMessage({ state, revision });
    } catch {
      finish(null);
    }
  });
}
