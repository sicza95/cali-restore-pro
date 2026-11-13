export type Dimensions = { width: number; height: number };
export type ImageFormat =
  'jpeg' | 'png' | 'tiff' | 'heif' | 'dng' | 'cr2' | 'cr3' | 'webp' | 'avif';
export type ImageManifest = {
  version: 1;
  format: ImageFormat;
  embeddedPreview: boolean;
  pixels: Dimensions;
  proxy: Dimensions;
  levels: Dimensions[];
};
export type WorkingImage = { manifest: ImageManifest; parts: Blob[] };
export type ImportIssue = 'invalid' | 'unsupported' | 'limit' | 'unavailable';
export class ImageImportError extends Error {
  constructor(readonly code: ImportIssue) {
    super(code);
  }
}
export const invalidImage = () => new ImageImportError('invalid');
export const unsupportedImage = () => new ImageImportError('unsupported');
export const imageLimit = () => new ImageImportError('limit');

export const tileSize = 512;
export const proxySide = 1536;
export const workingSide = 4096;
export const workingPixels = 8 * 1024 ** 2;
export const maxAssetBytes = 48 * 1024 ** 2;
export const maxProxyBytes = 12 * 1024 ** 2;
export const maxTileBytes = 2 * 1024 ** 2;

export function assertDimensions(width: number, height: number, pixels = 40 * 1024 ** 2) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1)
    throw invalidImage();
  if (width > 12288 || height > 12288 || width * height > pixels) throw imageLimit();
}

export function fit({ width, height }: Dimensions, side: number, pixels = side ** 2): Dimensions {
  const scale = Math.min(1, side / Math.max(width, height), Math.sqrt(pixels / (width * height)));
  return {
    width: Math.max(1, Math.floor(width * scale)),
    height: Math.max(1, Math.floor(height * scale)),
  };
}

export function imageLayout(pixels: Dimensions) {
  const proxy = fit(pixels, proxySide);
  const levels: Dimensions[] = [];
  let level = fit(pixels, workingSide, workingPixels);
  while (Math.max(level.width, level.height) > tileSize) {
    levels.push(level);
    level = { width: Math.ceil(level.width / 2), height: Math.ceil(level.height / 2) };
  }
  return { proxy, levels };
}

export const columns = (size: Dimensions) => Math.ceil(size.width / tileSize);
export const rows = (size: Dimensions) => Math.ceil(size.height / tileSize);
export const tiles = (size: Dimensions) => columns(size) * rows(size);

export function tilePart(manifest: ImageManifest, level: number, x: number, y: number) {
  const size = manifest.levels[level];
  if (
    !size ||
    !Number.isInteger(x) ||
    !Number.isInteger(y) ||
    x < 0 ||
    y < 0 ||
    x >= columns(size) ||
    y >= rows(size)
  )
    throw new RangeError('Invalid tile coordinates');
  return (
    1 +
    manifest.levels.slice(0, level).reduce((total, item) => total + tiles(item), 0) +
    y * columns(size) +
    x
  );
}
