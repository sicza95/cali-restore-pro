import { buildWorkingImage } from '../images/build';
import { chunkBytes } from './file-format';
import type { fileCipherWithKey } from './file-format';

type OriginalCipher = Pick<ReturnType<typeof fileCipherWithKey>, 'open'>;

// Builds the working image from a locally stored original, decrypting one chunk at a time.
// Only the last decrypted chunk is held, and it is zeroed when the build ends or aborts.
export function imageFromOriginal(
  original: OriginalCipher,
  readPart: (part: number) => Promise<ArrayBuffer>,
  size: number,
  signal: AbortSignal,
) {
  let cachedPart = 0;
  let cachedBytes = new Uint8Array();
  return buildWorkingImage(
    {
      size,
      async read(start, end) {
        const output = new Uint8Array(end - start);
        for (let at = start; at < end;) {
          signal.throwIfAborted();
          const part = Math.floor(at / chunkBytes) + 1;
          if (part !== cachedPart) {
            cachedBytes.fill(0);
            cachedBytes = new Uint8Array(await original.open(part, await readPart(part)));
            if (signal.aborted) {
              cachedBytes.fill(0);
              signal.throwIfAborted();
            }
            cachedPart = part;
          }
          const offset = at % chunkBytes;
          const count = Math.min(end - at, cachedBytes.length - offset);
          output.set(cachedBytes.subarray(offset, offset + count), at - start);
          at += count;
        }
        return output.buffer;
      },
    },
    signal,
  ).finally(() => cachedBytes.fill(0));
}
