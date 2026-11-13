import { canvasContext, decode } from './decode';
import { ImageSource } from './source';
import {
  columns,
  imageLayout,
  imageLimit,
  ImageImportError,
  maxAssetBytes,
  maxProxyBytes,
  maxTileBytes,
  rows,
  tileSize,
} from './types';
import type { Dimensions, ImageManifest } from './types';

function paint(
  ctx: OffscreenCanvasRenderingContext2D,
  bitmap: ImageBitmap,
  orientation: number,
  scale: Dimensions,
  x: number,
  y: number,
) {
  const w = bitmap.width;
  const h = bitmap.height;
  const matrix = [
    [1, 0, 0, 1, 0, 0],
    [-1, 0, 0, 1, w, 0],
    [-1, 0, 0, -1, w, h],
    [1, 0, 0, -1, 0, h],
    [0, 1, 1, 0, 0, 0],
    [0, 1, -1, 0, h, 0],
    [0, -1, -1, 0, h, w],
    [0, -1, 1, 0, 0, w],
  ];
  const [a, b, c, d, e, f] = matrix[orientation - 1]!;
  const sx = scale.width / (orientation >= 5 ? h : w);
  const sy = scale.height / (orientation >= 5 ? w : h);
  ctx.setTransform(a! * sx, b! * sy, c! * sx, d! * sy, e! * sx - x, f! * sy - y);
  ctx.drawImage(bitmap, 0, 0);
}

async function build(source: ImageSource, send: (message: unknown) => void) {
  const { bitmap, format, orientation, embeddedPreview } = await decode(source);
  try {
    const pixels =
      orientation >= 5
        ? { width: bitmap.height, height: bitmap.width }
        : { width: bitmap.width, height: bitmap.height };
    const manifest: ImageManifest = {
      version: 1,
      format,
      embeddedPreview,
      pixels,
      ...imageLayout(pixels),
    };
    const total = 1 + manifest.levels.reduce((n, size) => n + rows(size) * columns(size), 0);
    const parts: Blob[] = [];
    let bytes = 0;
    async function encode(canvas: OffscreenCanvas, limit: number) {
      const encoded = await canvas.convertToBlob({ type: 'image/png' });
      bytes += encoded.size;
      if (encoded.size > limit || bytes > maxAssetBytes) throw imageLimit();
      parts.push(encoded);
      send({ progress: parts.length / total });
    }

    const proxy = new OffscreenCanvas(manifest.proxy.width, manifest.proxy.height);
    paint(canvasContext(proxy), bitmap, orientation, manifest.proxy, 0, 0);
    await encode(proxy, maxProxyBytes);
    proxy.width = proxy.height = 1;
    const tile = new OffscreenCanvas(tileSize, tileSize);
    for (const size of manifest.levels) {
      for (let row = 0; row < rows(size); row++) {
        for (let column = 0; column < columns(size); column++) {
          const x = column * tileSize;
          const y = row * tileSize;
          tile.width = Math.min(tileSize, size.width - x);
          tile.height = Math.min(tileSize, size.height - y);
          paint(canvasContext(tile), bitmap, orientation, size, x, y);
          await encode(tile, maxTileBytes);
        }
      }
    }
    send({ manifest, parts });
  } finally {
    bitmap.close();
  }
}

self.onmessage = ({ data, ports }: MessageEvent<Blob | number>) => {
  const port = ports[0];
  const source =
    data instanceof Blob
      ? new ImageSource(data.size, (start, end) => data.slice(start, end).arrayBuffer())
      : new ImageSource(
          data,
          (start, end) =>
            new Promise((resolve, reject) => {
              if (!port) return reject(new Error('Source unavailable'));
              port.onmessage = ({ data }: MessageEvent<ArrayBuffer | null>) =>
                data ? resolve(data) : reject(new Error('Source unavailable'));
              port.postMessage({ start, end });
            }),
        );
  void build(source, (message) => self.postMessage(message)).catch((error: unknown) => {
    self.postMessage({ error: error instanceof ImageImportError ? error.code : 'invalid' });
  });
};
