import type { ImageSource } from './source';
import { ascii, boxes, read } from './binary';
import { tiffOrientation } from './raster';
import { assertDimensions, imageLimit, invalidImage, unsupportedImage } from './types';
import type { Box } from './binary';

const canonPreview = 'eaf42b5e1c984b88b9fbb7dc406e4d16';
const canonMetadata = '85c0b687820f11e08111f4ce462b6a48';
const hex = (view: DataView) =>
  Array.from(new Uint8Array(view.buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');

export async function bmffSource(blob: ImageSource) {
  const top = await boxes(blob);
  const ftyp = top[0];
  if (ftyp?.type !== 'ftyp' || ftyp.end - ftyp.start < 8 || ftyp.end - ftyp.start > 1024)
    throw invalidImage();
  const header = await read(blob, ftyp.start, ftyp.end - ftyp.start);
  const brands = [ascii(header, 0, 4)];
  for (let at = 8; at + 4 <= header.byteLength; at += 4) brands.push(ascii(header, at, 4));
  if (brands[0] === 'crx ') return { format: 'cr3', ...(await cr3Preview(blob, top)) } as const;
  if (
    top.some((box) => box.type === 'moov') ||
    brands.some((brand) => ['avis', 'msf1', 'hevc', 'hevx'].includes(brand))
  )
    throw unsupportedImage();
  const format = brands.includes('avif')
    ? 'avif'
    : brands.some((brand) => ['heic', 'heix', 'mif1'].includes(brand))
      ? 'heif'
      : undefined;
  if (!format) throw unsupportedImage();
  const meta = top.find((box) => box.type === 'meta');
  if (!meta) throw invalidImage();
  const props = (await boxes(blob, meta.start + 4, meta.end)).find((box) => box.type === 'iprp');
  if (!props) throw invalidImage();
  const container = (await boxes(blob, props.start, props.end)).find((box) => box.type === 'ipco');
  if (!container) throw invalidImage();
  let extents = 0;
  let area = 0;
  let transfer: number | undefined;
  let config = false;
  for (const item of await boxes(blob, container.start, container.end)) {
    if (item.type === 'ispe') {
      if (item.end - item.start !== 12) throw invalidImage();
      const data = await read(blob, item.start + 4, 8);
      const width = data.getUint32(0);
      const height = data.getUint32(4);
      assertDimensions(width, height, format === 'heif' ? 16 * 1024 ** 2 : undefined);
      extents++;
      area += width * height;
    }
    if (format === 'heif' && item.type === 'pixi') {
      const size = item.end - item.start;
      if (size < 6 || size > 9) throw unsupportedImage();
      const data = await read(blob, item.start, size);
      if (
        data.getUint8(4) !== size - 5 ||
        new Uint8Array(data.buffer, 5).some((bits) => bits !== 8)
      )
        throw unsupportedImage();
    }
    if (format === 'heif' && item.type === 'hvcC') {
      if (item.end - item.start < 23) throw invalidImage();
      const data = await read(blob, item.start, 23);
      if (data.getUint8(17) & 7 || data.getUint8(18) & 7) throw unsupportedImage();
      config = true;
    }
    if (format === 'heif' && item.type === 'colr') {
      if (item.end - item.start !== 11) throw unsupportedImage();
      const data = await read(blob, item.start, 11);
      if (
        ascii(data, 0, 4) !== 'nclx' ||
        ![1, 2].includes(data.getUint16(4)) ||
        ![1, 2, 13].includes(data.getUint16(6))
      )
        throw unsupportedImage();
      if (transfer !== undefined && transfer !== data.getUint16(6)) throw unsupportedImage();
      transfer = data.getUint16(6);
    }
  }
  if (!extents) throw invalidImage();
  if (format === 'heif' && !config) throw unsupportedImage();
  if (area > 80 * 1024 ** 2) throw imageLimit();
  return { format, transfer } as const;
}

async function cr3Preview(blob: ImageSource, top: Box[]) {
  let preview: ImageSource | undefined;
  let orientation: number | undefined;
  for (const box of top) {
    if (
      box.type === 'uuid' &&
      box.end - box.start > 48 &&
      hex(await read(blob, box.start, 16)) === canonPreview
    ) {
      const header = await read(blob, box.start + 24, 24);
      if (ascii(header, 4, 4) !== 'PRVW') continue;
      const start = box.start + 48;
      // The PRVW box can be followed by padding within the outer UUID.
      const size = header.getUint32(20);
      if (size < 4 || start + size > box.end || header.getUint32(0) < size + 24)
        throw invalidImage();
      if (size > 64 * 1024 ** 2) throw imageLimit();
      preview = blob.slice(start, start + size);
    }
    if (box.type === 'moov') {
      for (const item of await boxes(blob, box.start, box.end)) {
        if (
          item.type !== 'uuid' ||
          item.end - item.start < 16 ||
          hex(await read(blob, item.start, 16)) !== canonMetadata
        )
          continue;
        for (const child of await boxes(blob, item.start + 16, item.end)) {
          if (child.type === 'CMT1') {
            if (child.end - child.start > 2 * 1024 ** 2) throw imageLimit();
            orientation = tiffOrientation(await read(blob, child.start, child.end - child.start));
          }
        }
      }
    }
  }
  if (!preview) throw unsupportedImage();
  return { source: preview, orientation };
}
