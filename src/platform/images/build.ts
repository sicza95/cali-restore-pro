import { maxSourceBytes } from '../vault/file-format';
import { maxEncodedRaster } from './source';
import type { ReadRange } from './source';
import { ImageImportError, imageLimit, invalidImage } from './types';
import type { ImportIssue, WorkingImage } from './types';

let active: Promise<void> | undefined;

export async function buildWorkingImage(
  source: Blob | { size: number; read: ReadRange },
  signal: AbortSignal,
  progress?: (fraction: number) => void,
): Promise<WorkingImage> {
  signal.throwIfAborted();
  if (!source.size) throw invalidImage();
  if (source.size > maxSourceBytes) throw imageLimit();
  if (typeof OffscreenCanvas === 'undefined' || typeof Worker === 'undefined')
    throw new ImageImportError('unavailable');
  while (active) {
    await waitForWorker(active, signal);
    signal.throwIfAborted();
  }
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./image.worker.ts', import.meta.url), { type: 'module' });
    let release!: () => void;
    active = new Promise<void>((resolve) => {
      release = resolve;
    });
    const range = source instanceof Blob ? undefined : new MessageChannel();
    const timeout = setTimeout(() => fail(new ImageImportError('limit')), 120_000);
    function dispose() {
      active = undefined;
      release();
      clearTimeout(timeout);
      worker.terminate();
      range?.port1.close();
      signal.removeEventListener('abort', abort);
    }
    function fail(error: unknown) {
      dispose();
      reject(error);
    }
    function abort() {
      fail(signal.reason);
    }
    signal.addEventListener('abort', abort, { once: true });
    if (range && !(source instanceof Blob)) {
      range.port1.onmessage = ({ data }: MessageEvent<{ start: number; end: number }>) => {
        const { start, end } = data;
        if (
          !Number.isInteger(start) ||
          !Number.isInteger(end) ||
          start < 0 ||
          end < start ||
          end > source.size ||
          end - start > maxEncodedRaster
        )
          return fail(invalidImage());
        void source.read(start, end).then(
          (bytes) => range.port1.postMessage(bytes, [bytes]),
          () => range.port1.postMessage(null),
        );
      };
    }
    worker.onmessage = ({
      data,
    }: MessageEvent<WorkingImage | { progress: number } | { error: ImportIssue }>) => {
      if ('error' in data) return fail(new ImageImportError(data.error));
      if ('progress' in data) return progress?.(data.progress);
      dispose();
      resolve(data);
    };
    const unavailable = () => fail(new ImageImportError('unavailable'));
    worker.onerror = unavailable;
    worker.onmessageerror = unavailable;
    try {
      worker.postMessage(source instanceof Blob ? source : source.size, range ? [range.port2] : []);
    } catch (error) {
      fail(error);
    }
  });
}

function waitForWorker(worker: Promise<void>, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    void worker.then(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    });
  });
}
