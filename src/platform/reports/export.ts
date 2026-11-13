import type { Draft } from './types';

export function exportReport(draft: Draft, signal: AbortSignal): Promise<Blob> {
  signal.throwIfAborted();
  if (
    draft.surfaces.length > 150 ||
    draft.surfaces.reduce((total, surface) => total + surface.references.length, 0) > 2000 ||
    (draft.estimate?.detail?.phases.length ?? 0) > 500 ||
    (draft.workbookEstimate?.extras.length ?? 0) > 500 ||
    (draft.estimate?.summary.adjustments.length ?? 0) > 500
  )
    throw new Error('Report size limit');
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./export.worker.ts', import.meta.url), { type: 'module' });
    function dispose() {
      worker.terminate();
      signal.removeEventListener('abort', abort);
    }
    function abort() {
      dispose();
      reject(signal.reason);
    }
    function fail() {
      dispose();
      reject(new Error('Report could not be encoded'));
    }
    signal.addEventListener('abort', abort, { once: true });
    worker.onmessage = ({ data }: MessageEvent<unknown>) => {
      if (!(data instanceof Blob)) return fail();
      dispose();
      resolve(data);
    };
    worker.onerror = fail;
    worker.onmessageerror = fail;
    try {
      worker.postMessage(draft);
    } catch {
      fail();
    }
  });
}
