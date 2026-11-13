import { ascii, read } from './binary';
import { bmffSource } from './bmff';
import { jpegFrame, pngFrame, webpFrame } from './raster';
import { tiffSource } from './tiff';
import { assertDimensions, invalidImage, unsupportedImage } from './types';
import type { Frame } from './raster';
import type { ImageSource } from './source';
import type { ImageFormat } from './types';

type Raster = {
  format: ImageFormat;
  bitmap: ImageBitmap;
  orientation: number;
  embeddedPreview: boolean;
};
type Encoded = { format: ImageFormat; source: ImageSource; orientation?: number };

export function canvasContext(canvas: OffscreenCanvas) {
  const ctx = canvas.getContext('2d', { colorSpace: 'srgb' });
  if (!ctx) throw unsupportedImage();
  ctx.imageSmoothingQuality = 'high';
  return ctx;
}

async function identify(source: ImageSource) {
  const head = await read(source, 0, Math.min(12, source.size));
  if (head.byteLength < 8) throw invalidImage();
  if (head.getUint16(0) === 0xffd8) return { format: 'jpeg', source } as const;
  if (head.getUint32(0) === 0x89504e47) return { format: 'png', source } as const;
  if ([0x4949, 0x4d4d].includes(head.getUint16(0))) return tiffSource(source);
  if (ascii(head, 0, 4) === 'RIFF') return { format: 'webp', source } as const;
  if (ascii(head, 4, 4) === 'ftyp') {
    const info = await bmffSource(source);
    return 'source' in info ? info : { ...info, source };
  }
  throw unsupportedImage();
}

export async function decode(source: ImageSource): Promise<Raster> {
  const info = await identify(source);
  if (info.format === 'tiff') {
    return { ...info, bitmap: await info.raster(), embeddedPreview: false };
  }
  if (info.format === 'heif') {
    return {
      format: 'heif',
      bitmap: await decodeHeif(info.source, info.transfer),
      orientation: 1,
      embeddedPreview: false,
    };
  }
  return decodeNative(info);
}

async function decodeNative({ format, source, orientation }: Encoded): Promise<Raster> {
  let frame: Frame | undefined;
  const embeddedPreview = format === 'dng' || format === 'cr2' || format === 'cr3';
  const codec = embeddedPreview ? 'jpeg' : format;
  if (codec === 'jpeg') frame = await jpegFrame(source);
  if (codec === 'png') frame = await pngFrame(source);
  if (codec === 'webp') frame = await webpFrame(source);
  const bitmap = await createImageBitmap(await source.blob('image/' + codec), {
    imageOrientation: 'from-image',
    colorSpaceConversion: 'default',
  }).catch(() => {
    throw invalidImage();
  });
  try {
    assertDimensions(bitmap.width, bitmap.height);
    if (frame) {
      const swap = (frame.orientation ?? 1) >= 5;
      if (
        bitmap.width !== (swap ? frame.height : frame.width) ||
        bitmap.height !== (swap ? frame.width : frame.height)
      )
        throw unsupportedImage();
    }
    return {
      format,
      bitmap,
      orientation: embeddedPreview && frame?.orientation === undefined ? (orientation ?? 1) : 1,
      embeddedPreview,
    };
  } catch (error) {
    bitmap.close();
    throw error;
  }
}

async function decodeHeif(source: ImageSource, transfer?: number) {
  const lib = await import('libheif-js/libheif-wasm/libheif-bundle.mjs')
    .then(({ default: initialize }) => initialize())
    .catch(() => {
      throw unsupportedImage();
    });
  const images = new lib.HeifDecoder().decode(await source.arrayBuffer());
  const image = images.find((item) => item.is_primary());
  if (!image) throw invalidImage();
  const width = image.get_width();
  const height = image.get_height();
  assertDimensions(width, height, 16 * 1024 ** 2);
  const data = new ImageData(width, height);
  const output = await new Promise<ImageData | null>((resolve) => image.display(data, resolve));
  if (!output) throw invalidImage();
  if (transfer === 1) {
    const lookup = Uint8Array.from({ length: 256 }, (_, i) => {
      const v = i / 255;
      const linear = v < 0.081 ? v / 4.5 : ((v + 0.099) / 1.099) ** (1 / 0.45);
      return Math.round(
        255 * (linear <= 0.0031308 ? 12.92 * linear : 1.055 * linear ** (1 / 2.4) - 0.055),
      );
    });
    for (let i = 0; i < data.data.length; i += 4) {
      data.data[i] = lookup[data.data[i]!]!;
      data.data[i + 1] = lookup[data.data[i + 1]!]!;
      data.data[i + 2] = lookup[data.data[i + 2]!]!;
    }
  }
  const canvas = new OffscreenCanvas(width, height);
  canvasContext(canvas).putImageData(output, 0, 0);
  return canvas.transferToImageBitmap();
}
