export const chunkBytes = 1 << 20;
export const maxSourceBytes = 256 * chunkBytes;
export const maxManifestBytes = 16 * 1024;
const encode = new TextEncoder();
const decode = new TextDecoder('utf-8', { fatal: true });
const uuidPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;

export type FileShape = { sourceBytes: number; manifestBytes: number };
export type SourceMetadata = { name: string; type: string; size: number };

export function assertID(id: string) {
  if (!uuidPattern.test(id)) throw new Error('Invalid identifier');
}

export function assertShape(shape: FileShape) {
  if (
    !Number.isSafeInteger(shape.sourceBytes) ||
    shape.sourceBytes < 1 ||
    shape.sourceBytes > maxSourceBytes ||
    !Number.isSafeInteger(shape.manifestBytes) ||
    shape.manifestBytes < 17 ||
    shape.manifestBytes > maxManifestBytes
  )
    throw new Error('Invalid file size');
}

export const chunkCount = (shape: FileShape) => Math.ceil(shape.sourceBytes / chunkBytes);
export const partBytes = (shape: FileShape, part: number) =>
  part === 0
    ? shape.manifestBytes
    : Math.min(chunkBytes, shape.sourceBytes - (part - 1) * chunkBytes) + 16;

export async function fileCipher(root: CryptoKey, account: string, project: string, id: string) {
  assertID(project);
  assertID(id);
  const context = ['calirestore-original', 1, account, project, id];
  const key = await crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: encode.encode(id),
      info: encode.encode(JSON.stringify(context)),
    },
    root,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
  const params = (part: number) => {
    const iv = new Uint8Array(12);
    new DataView(iv.buffer).setUint32(8, part);
    return {
      name: 'AES-GCM',
      iv,
      tagLength: 128,
      additionalData: encode.encode(JSON.stringify([...context, part])),
    };
  };
  return {
    seal: (part: number, bytes: BufferSource) => crypto.subtle.encrypt(params(part), key, bytes),
    open: (part: number, bytes: BufferSource) => crypto.subtle.decrypt(params(part), key, bytes),
  };
}

export function sourceManifest(file: File) {
  return encode.encode(JSON.stringify({ v: 1, name: file.name, type: file.type, size: file.size }));
}

export function parseManifest(bytes: ArrayBuffer, shape: FileShape): SourceMetadata {
  const value = JSON.parse(decode.decode(bytes)) as
    (Partial<SourceMetadata> & { v?: number }) | null;
  if (
    value?.v !== 1 ||
    typeof value.name !== 'string' ||
    typeof value.type !== 'string' ||
    value.size !== shape.sourceBytes
  )
    throw new Error('Invalid file manifest');
  return { name: value.name, type: value.type, size: value.size };
}
