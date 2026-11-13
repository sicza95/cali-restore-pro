import type { ImageSource } from './source';
import { ascii, read } from './binary';
import { assertDimensions, imageLimit, invalidImage, unsupportedImage } from './types';

export type Frame = { width: number; height: number; orientation?: number };

export function tiffOrientation(tiff: DataView) {
  if (tiff.byteLength < 8) return;
  const order = tiff.getUint16(0);
  if (order !== 0x4949 && order !== 0x4d4d) return;
  const le = order === 0x4949;
  if (tiff.getUint16(2, le) !== 42) return;
  const offset = tiff.getUint32(4, le);
  if (offset + 2 > tiff.byteLength) return;
  const count = tiff.getUint16(offset, le);
  if (offset + 2 + count * 12 > tiff.byteLength) return;
  for (let i = offset + 2; i < offset + 2 + count * 12; i += 12) {
    if (tiff.getUint16(i, le) !== 274) continue;
    const orientation = tiff.getUint16(i + 8, le);
    if (
      tiff.getUint16(i + 2, le) === 3 &&
      tiff.getUint32(i + 4, le) === 1 &&
      orientation >= 1 &&
      orientation <= 8
    )
      return orientation;
  }
}

export async function jpegFrame(blob: ImageSource, checkEnd = true): Promise<Frame> {
  const head = await read(blob, 0, Math.min(blob.size, 2 * 1024 ** 2));
  if (head.byteLength < 4 || head.getUint16(0) !== 0xffd8) throw invalidImage();
  if (checkEnd && (await read(blob, blob.size - 2, 2)).getUint16(0) !== 0xffd9)
    throw invalidImage();
  let frame: Frame | undefined;
  let orientation: number | undefined;
  for (let at = 2; at + 4 <= head.byteLength;) {
    if (head.getUint8(at++) !== 255) throw invalidImage();
    while (at < head.byteLength && head.getUint8(at) === 255) at++;
    if (at + 2 >= head.byteLength) break;
    const marker = head.getUint8(at++);
    const length = head.getUint16(at);
    if (length < 2 || at + length > head.byteLength) break;
    if (marker === 0xda && frame) return { ...frame, orientation };
    if ([0xc0, 0xc1, 0xc2].includes(marker)) {
      if (length < 8 || frame) throw invalidImage();
      const components = head.getUint8(at + 7);
      if (head.getUint8(at + 2) !== 8 || ![1, 3, 4].includes(components)) throw unsupportedImage();
      frame = { width: head.getUint16(at + 5), height: head.getUint16(at + 3) };
      assertDimensions(frame.width, frame.height);
    }
    if (marker === 0xe1 && length >= 16 && ascii(head, at + 2, 6) === 'Exif\0\0') {
      const tiff = new DataView(head.buffer, at + 8, length - 8);
      orientation ??= tiffOrientation(tiff);
    }
    at += length;
  }
  if (head.byteLength < blob.size && head.byteLength === 2 * 1024 ** 2) throw imageLimit();
  throw invalidImage();
}

export async function pngFrame(blob: ImageSource): Promise<Frame> {
  const header = await read(blob, 0, 33);
  if (
    header.getUint32(0) !== 0x89504e47 ||
    header.getUint32(4) !== 0x0d0a1a0a ||
    header.getUint32(8) !== 13 ||
    ascii(header, 12, 4) !== 'IHDR'
  )
    throw invalidImage();
  const width = header.getUint32(16);
  const height = header.getUint32(20);
  assertDimensions(width, height);
  let image = false;
  let orientation: number | undefined;
  let at = 33;
  for (let n = 0; at + 12 <= blob.size && n < 4096; n++) {
    const chunk = await read(blob, at, 8);
    const length = chunk.getUint32(0);
    const type = ascii(chunk, 4, 4);
    at += length + 12;
    if (at > blob.size) throw invalidImage();
    if (type === 'acTL') throw unsupportedImage();
    if (type === 'eXIf') {
      if (length > 256 * 1024) throw imageLimit();
      orientation = tiffOrientation(await read(blob, at - length - 4, length));
    }
    if (type === 'IDAT') image = true;
    if (type === 'IEND' && image && length === 0 && at === blob.size)
      return { width, height, orientation };
  }
  throw invalidImage();
}

export async function webpFrame(blob: ImageSource): Promise<Frame> {
  const head = await read(blob, 0, Math.min(30, blob.size));
  if (
    head.byteLength < 25 ||
    ascii(head, 0, 4) !== 'RIFF' ||
    ascii(head, 8, 4) !== 'WEBP' ||
    head.getUint32(4, true) + 8 !== blob.size
  )
    throw invalidImage();
  const type = ascii(head, 12, 4);
  let width: number;
  let height: number;
  if (type === 'VP8X' && head.byteLength >= 30) {
    if (head.getUint8(20) & 2) throw unsupportedImage();
    width = (head.getUint32(23, true) >>> 8) + 1;
    height = (head.getUint32(26, true) >>> 8) + 1;
  } else if (type === 'VP8L' && head.getUint8(20) === 0x2f) {
    const size = head.getUint32(21, true);
    width = (size & 0x3fff) + 1;
    height = ((size >> 14) & 0x3fff) + 1;
  } else if (type === 'VP8 ' && head.byteLength >= 30 && ascii(head, 23, 3) === '\x9d\x01\x2a') {
    width = head.getUint16(26, true) & 0x3fff;
    height = head.getUint16(28, true) & 0x3fff;
  } else throw unsupportedImage();
  assertDimensions(width, height);
  let orientation: number | undefined;
  if (type === 'VP8X' && head.getUint8(20) & 8) {
    for (let at = 12, n = 0; at + 8 <= blob.size && n < 2048; n++) {
      const chunk = await read(blob, at, 8);
      const size = chunk.getUint32(4, true);
      const start = at + 8;
      at = start + size + (size % 2);
      if (at > blob.size) throw invalidImage();
      if (ascii(chunk, 0, 4) !== 'EXIF') continue;
      if (size > 256 * 1024) throw imageLimit();
      const data = await read(blob, start, size);
      orientation =
        data.byteLength >= 6 && ascii(data, 0, 6) === 'Exif\0\0'
          ? tiffOrientation(new DataView(data.buffer, 6))
          : tiffOrientation(data);
      break;
    }
  }
  return { width, height, orientation };
}
