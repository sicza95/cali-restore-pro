import { decrypt, encrypt } from './aead';
import { importCode } from './crypto';

const encode = new TextEncoder();
const magic = encode.encode('CRPROJ02');
const legacyMagic = encode.encode('CRPROJ01');
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
  backupVersion(header);
  const size = new DataView(header.buffer).getUint32(backupHeaderBytes - 4);
  if (size <= 16 || size > maxIndexBytes) throw new Error('Invalid backup header');
  return size;
}

export function backupVersion(header: Uint8Array<ArrayBuffer>): 1 | 2 {
  if (header.length !== backupHeaderBytes) throw new Error('Invalid backup header');
  if (magic.every((byte, i) => header[i] === byte)) return 2;
  if (legacyMagic.every((byte, i) => header[i] === byte)) return 1;
  throw new Error('Invalid backup version');
}

export async function backupCipher(code: string, header: Uint8Array<ArrayBuffer>) {
  backupVersion(header);
  const root = await importCode(code);
  const key = await crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: header.subarray(magic.length, magic.length + 32),
      info: header.subarray(0, magic.length),
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
    seal: (bytes: BufferSource) => encrypt(parameters(), key, bytes),
    open: (bytes: BufferSource) => decrypt(parameters(), key, bytes),
  };
}
