import {
  assertDimensions,
  imageLayout,
  maxAssetBytes,
  maxProxyBytes,
  maxTileBytes,
  tiles,
} from '../images/types';
import type { ImageManifest, WorkingImage } from '../images/types';

const text = new TextEncoder();
const decode = new TextDecoder('utf-8', { fatal: true });
const headerLimit = 2048;
export const imageHeaderPart = -1;
export const imagePart = (part: number) => -2 - part;

function parseManifest(bytes: ArrayBuffer): ImageManifest {
  const value = JSON.parse(decode.decode(bytes)) as ImageManifest;
  assertDimensions(value.pixels.width, value.pixels.height);
  const layout = imageLayout(value.pixels);
  if (
    value.version !== 1 ||
    !['jpeg', 'png', 'tiff', 'heif', 'dng', 'cr2', 'cr3', 'webp', 'avif'].includes(value.format) ||
    value.embeddedPreview !== ['dng', 'cr2', 'cr3'].includes(value.format) ||
    JSON.stringify(value.proxy) !== JSON.stringify(layout.proxy) ||
    JSON.stringify(value.levels) !== JSON.stringify(layout.levels)
  )
    throw new Error('Invalid working image manifest');
  return value;
}

export async function imageCipher(root: CryptoKey, account: string, project: string, id: string) {
  const context = ['calirestore-image-cache', 1, account, project, id];
  const key = await crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: text.encode(id),
      info: text.encode(JSON.stringify(context)),
    },
    root,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
  const params = (part: number, iv: Uint8Array<ArrayBuffer>) => ({
    name: 'AES-GCM',
    iv,
    tagLength: 128,
    additionalData: text.encode(JSON.stringify([...context, part])),
  });
  function limit(part: number) {
    return part === imageHeaderPart
      ? headerLimit
      : part === imagePart(0)
        ? maxProxyBytes
        : maxTileBytes;
  }
  async function open(part: number, bytes: ArrayBuffer) {
    if (bytes.byteLength < 29 || bytes.byteLength > limit(part) + 28)
      throw new Error('Invalid working image size');
    return crypto.subtle.decrypt(
      params(part, new Uint8Array(bytes, 0, 12)),
      key,
      new Uint8Array(bytes, 12),
    );
  }
  async function seal(part: number, bytes: BufferSource) {
    if (!bytes.byteLength || bytes.byteLength > limit(part))
      throw new Error('Invalid working image size');
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(params(part, iv), key, bytes);
    const combined = new Uint8Array(12 + encrypted.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(encrypted), 12);
    return combined.buffer;
  }
  return {
    async sealParts({ manifest, parts }: WorkingImage, signal: AbortSignal) {
      if (
        parts.length !== 1 + manifest.levels.reduce((total, size) => total + tiles(size), 0) ||
        parts.reduce((total, blob) => total + blob.size, 0) > maxAssetBytes
      )
        throw new Error('Invalid working image');
      const records = [await seal(imageHeaderPart, text.encode(JSON.stringify(manifest)))];
      for (let i = 0; i < parts.length; i++) {
        signal.throwIfAborted();
        records.push(await seal(imagePart(i), await parts[i]!.arrayBuffer()));
      }
      signal.throwIfAborted();
      return records;
    },
    async manifest(bytes: ArrayBuffer) {
      return parseManifest(await open(imageHeaderPart, bytes));
    },
    async asset(part: number, bytes: ArrayBuffer) {
      return new Blob([await open(part, bytes)], { type: 'image/png' });
    },
  };
}
