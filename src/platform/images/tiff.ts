import type { ImageSource } from './source';
import { read } from './binary';
import { jpegFrame } from './raster';
import { assertDimensions, imageLimit, invalidImage, unsupportedImage } from './types';

const wanted = new Set([
  254, 256, 257, 258, 259, 262, 273, 274, 277, 278, 279, 284, 322, 324, 325, 330, 338, 339, 513,
  514, 34675, 50706,
]);

async function directory(blob: ImageSource, offset: number, le: boolean) {
  const count = (await read(blob, offset, 2)).getUint16(0, le);
  if (count > 1024) throw imageLimit();
  const data = await read(blob, offset + 2, count * 12 + 4);
  const tags = new Map<number, number[]>();
  for (let at = 0; at < count * 12; at += 12) {
    const tag = data.getUint16(at, le);
    if (!wanted.has(tag)) continue;
    if (tags.has(tag)) throw invalidImage();
    const type = data.getUint16(at + 2, le);
    const length = data.getUint32(at + 4, le);
    if (tag === 34675 || tag === 50706) {
      tags.set(tag, []);
      continue;
    }
    const size = type === 3 ? 2 : type === 4 || type === 13 ? 4 : 0;
    if (!size || !length || length > 16384) throw unsupportedImage();
    const values =
      size * length <= 4
        ? new DataView(data.buffer, at + 8, 4)
        : await read(blob, data.getUint32(at + 8, le), size * length);
    tags.set(
      tag,
      Array.from({ length }, (_, i) =>
        size === 2 ? values.getUint16(i * size, le) : values.getUint32(i * size, le),
      ),
    );
  }
  return { tags, next: data.getUint32(count * 12, le) };
}

const first = (tags: Map<number, number[]>, key: number, fallback = 0) =>
  tags.get(key)?.[0] ?? fallback;
const validOrientation = (value: number) => {
  if (value < 1 || value > 8) throw invalidImage();
  return value;
};

export async function tiffSource(blob: ImageSource) {
  const head = await read(blob, 0, Math.min(16, blob.size));
  if (head.byteLength < 8) throw invalidImage();
  const le = head.getUint16(0) === 0x4949;
  if (head.getUint16(2, le) !== 42) throw unsupportedImage();
  const cr2 = head.byteLength >= 16 && head.getUint32(8) === 0x43520200;
  const base = head.getUint32(4, le);
  const root = await directory(blob, base, le);
  const orientation = validOrientation(first(root.tags, 274, 1));
  if (cr2 || root.tags.has(50706)) {
    const entries = [root];
    const visited = new Set([base]);
    let best: { blob: ImageSource; area: number; orientation: number } | undefined;
    for (const entry of entries) {
      const { tags, next } = entry;
      const candidates = [
        [tags.get(513), tags.get(514)],
        [tags.get(273), tags.get(279)],
        [tags.get(324), tags.get(325)],
      ] as const;
      for (const [starts, lengths] of candidates) {
        if (starts?.length !== 1 || lengths?.length !== 1 || lengths[0]! < 4) continue;
        const [start] = starts as [number];
        const [length] = lengths as [number];
        if (start + length > blob.size || length > 64 * 1024 ** 2) continue;
        if ((await read(blob, start, 2)).getUint16(0) !== 0xffd8) continue;
        const jpeg = blob.slice(start, start + length);
        const frame = await jpegFrame(jpeg, false).catch(() => undefined);
        if (!frame || frame.width * frame.height <= (best?.area ?? 0)) continue;
        if ((await read(jpeg, jpeg.size - 2, 2)).getUint16(0) !== 0xffd9) continue;
        best = {
          blob: jpeg,
          area: frame.width * frame.height,
          orientation: frame.orientation ?? validOrientation(first(tags, 274, orientation)),
        };
      }
      for (const child of [next, ...(tags.get(330) ?? [])]) {
        if (!child || visited.has(child)) continue;
        if (entries.length === 16) throw imageLimit();
        visited.add(child);
        entries.push(await directory(blob, child, le));
      }
    }
    if (!best) throw unsupportedImage();
    return {
      format: cr2 ? 'cr2' : 'dng',
      source: best.blob,
      orientation: best.orientation,
    } as const;
  }
  if (root.next || root.tags.has(330)) throw unsupportedImage();
  return { format: 'tiff', orientation, ...stripSource(blob, root.tags) } as const;
}

function stripSource(blob: ImageSource, tags: Map<number, number[]>) {
  const width = first(tags, 256);
  const height = first(tags, 257);
  assertDimensions(width, height, 24 * 1024 ** 2);
  const photometric = first(tags, 262);
  const samples = first(tags, 277, 1);
  const bits = tags.get(258) ?? [];
  const gray = photometric === 0 || photometric === 1;
  const alpha = samples === 4;
  const extra = first(tags, 338);
  if (
    first(tags, 259, 1) !== 1 ||
    first(tags, 284, 1) !== 1 ||
    first(tags, 339, 1) !== 1 ||
    tags.has(34675) ||
    tags.has(322) ||
    !(gray ? samples === 1 : photometric === 2 && (samples === 3 || (alpha && extra === 2))) ||
    bits.length !== samples ||
    bits.some((bit) => bit !== 8)
  )
    throw unsupportedImage();
  const starts = tags.get(273) ?? [];
  const lengths = tags.get(279) ?? [];
  const step = first(tags, 278, height);
  if (!step || starts.length !== Math.ceil(height / step) || lengths.length !== starts.length)
    throw invalidImage();
  const stride = width * samples;
  for (let strip = 0; strip < starts.length; strip++) {
    if (
      lengths[strip] !== Math.min(step, height - strip * step) * stride ||
      starts[strip]! + lengths[strip]! > blob.size
    )
      throw invalidImage();
  }
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d', { colorSpace: 'srgb' });
  if (!ctx) throw unsupportedImage();
  return {
    async raster() {
      const rows = Math.max(1, Math.floor((1 << 20) / stride));
      for (let strip = 0; strip < starts.length; strip++) {
        const stripRows = lengths[strip]! / stride;
        for (let row = 0; row < stripRows; row += rows) {
          const count = Math.min(rows, stripRows - row);
          const data = await read(blob, starts[strip]! + row * stride, count * stride);
          const src = new Uint8Array(data.buffer);
          const dest = ctx.createImageData(width, count);
          for (let i = 0, p = 0; i < src.length; i += samples, p += 4) {
            const red = photometric === 0 ? 255 - src[i]! : src[i]!;
            dest.data[p] = red;
            dest.data[p + 1] = gray ? red : src[i + 1]!;
            dest.data[p + 2] = gray ? red : src[i + 2]!;
            dest.data[p + 3] = alpha ? src[i + 3]! : 255;
          }
          ctx.putImageData(dest, 0, strip * step + row);
        }
      }
      return canvas.transferToImageBitmap();
    },
  };
}
