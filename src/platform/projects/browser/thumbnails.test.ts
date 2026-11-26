import { expect, it, vi } from 'vitest';
import {
  createThumbnailService,
  renderThumbnail,
  thumbnailObjectURL,
  thumbnailScheduler,
} from './thumbnails';
import type { ThumbnailCache } from './thumbnails';

const key = { project: 'p', id: 'a', version: '1' };
const signal = () => new AbortController().signal;
const cache = (): ThumbnailCache => ({
  get: vi.fn(async () => undefined),
  put: vi.fn(async () => {}),
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
it('is lazy, caches by version, and returns cached thumbnails without reading the proxy', async () => {
  const proxy = new Blob(['proxy']);
  const thumbnail = new Blob(['thumb']);
  const store = cache();
  const workingProxy = vi.fn(async () => proxy);
  const render = vi.fn(async () => thumbnail);
  const service = createThumbnailService({ cache: store, workingProxy, render });
  expect(workingProxy).not.toHaveBeenCalled();
  expect(await service.get(key, signal())).toBe(thumbnail);
  expect(store.put).toHaveBeenCalledWith(key, thumbnail, expect.any(AbortSignal));
  vi.mocked(store.get).mockResolvedValue(thumbnail);
  expect(await service.get({ ...key, version: '2' }, signal())).toBe(thumbnail);
  expect(workingProxy).toHaveBeenCalledTimes(1);
  service.dispose();
  await expect(service.get(key, signal())).rejects.toThrow();
});
it('bounds concurrent decodes and cancels queued work without starting it', async () => {
  const first = deferred<Blob>();
  const render = vi.fn(() => first.promise);
  const workingProxy = vi.fn(async () => new Blob(['proxy']));
  const service = createThumbnailService({
    cache: cache(),
    workingProxy,
    render,
    schedule: thumbnailScheduler(1),
  });
  const active = service.get(key, signal());
  await vi.waitFor(() => expect(render).toHaveBeenCalledTimes(1));
  const controller = new AbortController();
  const queued = service.get({ ...key, id: 'b' }, controller.signal);
  const rejected = expect(queued).rejects.toThrow();
  controller.abort();
  await rejected;
  first.resolve(new Blob(['first']));
  await active;
  expect(workingProxy).toHaveBeenCalledTimes(1);
});
it('does not cache or return a decode cancelled in flight, then releases the slot', async () => {
  const decoded = deferred<Blob>();
  const store = cache();
  const controller = new AbortController();
  const render = vi.fn(() => decoded.promise);
  const service = createThumbnailService({
    cache: store,
    workingProxy: async () => new Blob(['proxy']),
    render,
    schedule: thumbnailScheduler(1),
  });
  const request = service.get(key, controller.signal);
  const rejected = expect(request).rejects.toThrow();
  await vi.waitFor(() => expect(render).toHaveBeenCalledOnce());
  controller.abort();
  decoded.resolve(new Blob(['thumb']));
  await rejected;
  expect(store.put).not.toHaveBeenCalled();
  render.mockResolvedValueOnce(new Blob(['next']));
  await expect(service.get(key, signal())).resolves.toBeInstanceOf(Blob);
  expect(() => thumbnailScheduler(0)).toThrow();
  expect(() => thumbnailScheduler(9)).toThrow();
});
it('generates a 320px thumbnail from the proxy and closes the bitmap on success and failure', async () => {
  const bitmap = { width: 1536, height: 768, close: vi.fn() };
  const drawImage = vi.fn();
  const blob = new Blob(['png']);
  const convertToBlob = vi.fn(async () => blob);
  const dimensions: number[][] = [];
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => bitmap),
  );
  vi.stubGlobal(
    'OffscreenCanvas',
    class {
      constructor(width: number, height: number) {
        dimensions.push([width, height]);
      }
      getContext() {
        return { drawImage };
      }
      convertToBlob = convertToBlob;
    },
  );
  expect(await renderThumbnail(new Blob(['proxy']), signal())).toBe(blob);
  expect(dimensions).toEqual([[320, 160]]);
  expect(bitmap.close).toHaveBeenCalledTimes(1);
  convertToBlob.mockRejectedValueOnce(new Error('decode'));
  await expect(renderThumbnail(blob, signal())).rejects.toThrow('decode');
  expect(bitmap.close).toHaveBeenCalledTimes(2);
});
it('revokes object URLs when replaced, cleared, disposed and aborted', () => {
  const create = vi
    .spyOn(URL, 'createObjectURL')
    .mockReturnValueOnce('blob:one')
    .mockReturnValueOnce('blob:two');
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  const controller = new AbortController();
  const slot = thumbnailObjectURL(controller.signal);
  expect(slot.set(new Blob(['one']))).toBe('blob:one');
  expect(slot.set(new Blob(['two']))).toBe('blob:two');
  expect(revoke).toHaveBeenCalledWith('blob:one');
  controller.abort();
  expect(revoke).toHaveBeenCalledWith('blob:two');
  expect(slot.set(new Blob(['three']))).toBeUndefined();
  slot.dispose();
  expect(create).toHaveBeenCalledTimes(2);
  const other = thumbnailObjectURL();
  other.set(new Blob(['one']));
  other.set();
  expect(other.current()).toBeUndefined();
  other.dispose();
});
