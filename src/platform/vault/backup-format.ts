import { importCode } from './crypto';

const magic = new TextEncoder().encode('CRPROJ01');
export const backupHeaderBytes = magic.length + 32 + 4;
export const maxIndexBytes = 1024 * 1024;
export const maxBackupBytes = 512 * 1024 * 1024;

export function backupHeader(indexBytes: number) {
  const header = crypto.getRandomValues(new Uint8Array(backupHeaderBytes));
  header.set(magic);
  new DataView(header.buffer).setUint32(backupHeaderBytes - 4, indexBytes);
  return header;
}

export function indexSize(header: Uint8Array<ArrayBuffer>) {
  const size = new DataView(header.buffer).getUint32(backupHeaderBytes - 4);
  if (!magic.every((byte, i) => header[i] === byte) || size <= 16 || size > maxIndexBytes)
    throw new Error('Invalid backup header');
  return size;
}

export async function backupCipher(code: string, header: Uint8Array<ArrayBuffer>) {
  const root = await importCode(code);
  const key = await crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: header.subarray(magic.length, magic.length + 32),
      info: magic,
    },
    root,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
  let frame = 0;
  const parameters = () => {
    const iv = new Uint8Array(12);
    new DataView(iv.buffer).setUint32(8, frame++);
    return { name: 'AES-GCM', iv, additionalData: header, tagLength: 128 };
  };
  return {
    seal: (bytes: BufferSource) => crypto.subtle.encrypt(parameters(), key, bytes),
    open: (bytes: BufferSource) => crypto.subtle.decrypt(parameters(), key, bytes),
  };
}
