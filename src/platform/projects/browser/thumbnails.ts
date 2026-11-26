import { fit } from '../../images/types';

export type ThumbnailKey = { project: string; id: string; version: string };
export type ThumbnailCache = {
  get(key: ThumbnailKey, signal: AbortSignal): Promise<Blob | undefined>;
  put(key: ThumbnailKey, blob: Blob, signal: AbortSignal): Promise<void>;
};
export const thumbnailSide = 320;

/** Decode only the working proxy, never the original. Preserve aspect ratio without upscaling. */
export async function renderThumbnail(proxy: Blob, signal: AbortSignal): Promise<Blob> {
  signal.throwIfAborted();
  const bitmap = await createImageBitmap(proxy);
  try {
    signal.throwIfAborted();
    const size = fit(bitmap, thumbnailSide);
    const canvas = new OffscreenCanvas(size.width, size.height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Thumbnail canvas unavailable');
    context.drawImage(bitmap, 0, 0, size.width, size.height);
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    signal.throwIfAborted();
    return blob;
  } finally {
    bitmap.close();
  }
}

export function thumbnailScheduler(concurrency = 2) {
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8)
    throw new Error('Invalid thumbnail concurrency');
  let active = 0;
  const waiting: (() => void)[] = [];
  return async <T>(signal: AbortSignal, work: () => Promise<T>): Promise<T> => {
    signal.throwIfAborted();
    await new Promise<void>((resolve, reject) => {
      const start = () => {
        signal.removeEventListener('abort', abort);
        active++;
        resolve();
      };
      const abort = () => {
        const index = waiting.indexOf(start);
        if (index >= 0) waiting.splice(index, 1);
        reject(signal.reason);
      };
      if (active < concurrency) start();
      else {
        waiting.push(start);
        signal.addEventListener('abort', abort, { once: true });
      }
    });
    try {
      signal.throwIfAborted();
      return await work();
    } finally {
      active--;
      waiting.shift()?.();
    }
  };
}

// All file handles share this bound, even if UI components ask for independent vault.files().
const schedule = thumbnailScheduler();

export function createThumbnailService(options: {
  cache: ThumbnailCache;
  workingProxy: (key: ThumbnailKey, signal: AbortSignal) => Promise<Blob>;
  render?: typeof renderThumbnail;
  schedule?: ReturnType<typeof thumbnailScheduler>;
}) {
  const lifetime = new AbortController();
  return {
    /** Lazy: no work happens before get. Caller cancellation is independent of other requests. */
    get(key: ThumbnailKey, signal?: AbortSignal): Promise<Blob> {
      if (!key.version || key.version.length > 128)
        return Promise.reject(new Error('Invalid asset version'));
      const operation = signal ? AbortSignal.any([lifetime.signal, signal]) : lifetime.signal;
      return (options.schedule ?? schedule)(operation, async () => {
        const cached = await options.cache.get(key, operation);
        operation.throwIfAborted();
        if (cached) return cached;
        const proxy = await options.workingProxy(key, operation);
        operation.throwIfAborted();
        const blob = await (options.render ?? renderThumbnail)(proxy, operation);
        operation.throwIfAborted();
        await options.cache.put(key, blob, operation);
        operation.throwIfAborted();
        return blob;
      });
    },
    dispose: () => lifetime.abort(),
  };
}

/** One URL per preview slot. Replacing, clearing, disposing or aborting revokes the old URL. */
export function thumbnailObjectURL(signal?: AbortSignal) {
  let current: string | undefined;
  let disposed = signal?.aborted ?? false;
  const clear = () => {
    if (current) URL.revokeObjectURL(current);
    current = undefined;
  };
  const dispose = () => {
    clear();
    disposed = true;
    signal?.removeEventListener('abort', dispose);
  };
  signal?.addEventListener('abort', dispose, { once: true });
  return {
    current: () => current,
    set(blob?: Blob): string | undefined {
      clear();
      if (blob && !disposed) current = URL.createObjectURL(blob);
      return current;
    },
    dispose,
  };
}
