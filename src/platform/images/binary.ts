import type { ImageSource } from './source';
import { invalidImage, imageLimit } from './types';

export function ascii(view: DataView, at: number, count: number) {
  return String.fromCharCode(...new Uint8Array(view.buffer, view.byteOffset + at, count));
}

export async function read(blob: ImageSource, offset: number, length: number) {
  if (offset < 0 || length < 0 || offset + length > blob.size) throw invalidImage();
  return new DataView(await blob.slice(offset, offset + length).arrayBuffer());
}

export type Box = { type: string; start: number; end: number };
export async function boxes(blob: ImageSource, start = 0, end = blob.size) {
  const result: Box[] = [];
  for (let at = start; at < end;) {
    if (result.length === 2048) throw imageLimit();
    if (at + 8 > end) throw invalidImage();
    const header = await read(blob, at, 8);
    let size = header.getUint32(0);
    let head = 8;
    if (size === 1) {
      if (at + 16 > end) throw invalidImage();
      const extended = await read(blob, at + 8, 8);
      if (extended.getUint32(0)) throw imageLimit();
      size = extended.getUint32(4);
      head = 16;
    }
    if (size === 0) size = end - at;
    if (size < head || at + size > end) throw invalidImage();
    result.push({ type: ascii(header, 4, 4), start: at + head, end: at + size });
    at += size;
  }
  return result;
}
