/**
 * The one seam where data is encrypted and decrypted: vault data here, shared content through
 * `frame`/`unframe` in fixture-sharing.ts.
 *
 * Encryption is switched off for now so work can focus on UX and features;
 * the multi-user E2EE v2 design will be wired in here later. While it is off,
 * `encrypt` stores the bytes as they are plus a 16-byte zero tag, so every
 * size limit, part size and envelope check stays the same as with AES-GCM.
 * Keys are still derived and passed in, but they are not used.
 *
 * Data written while encryption was on cannot be read in plaintext mode
 * (its tag is not zero), and fails the same way a wrong key would.
 */
export const aead = { enabled: false };

const tagBytes = 16;

const view = (bytes: BufferSource) =>
  bytes instanceof ArrayBuffer
    ? new Uint8Array(bytes)
    : new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);

/** Plaintext mode: the bytes as they are plus a zero tag, the size AES-GCM would produce. */
export function frame(bytes: BufferSource) {
  const plain = view(bytes);
  const out = new Uint8Array(plain.byteLength + tagBytes);
  out.set(plain);
  return out.buffer;
}

/** Reverses {@link frame}; refuses data that was really encrypted. */
export function unframe(bytes: BufferSource) {
  const sealed = view(bytes);
  const end = sealed.byteLength - tagBytes;
  if (end < 0 || sealed.subarray(end).some((byte) => byte !== 0))
    throw new DOMException(
      'The operation failed for an operation-specific reason',
      'OperationError',
    );
  return sealed.slice(0, end).buffer;
}

export async function encrypt(
  algorithm: AesGcmParams,
  key: CryptoKey,
  bytes: BufferSource,
): Promise<ArrayBuffer> {
  return aead.enabled ? crypto.subtle.encrypt(algorithm, key, bytes) : frame(bytes);
}

export async function decrypt(
  algorithm: AesGcmParams,
  key: CryptoKey,
  bytes: BufferSource,
): Promise<ArrayBuffer> {
  return aead.enabled ? crypto.subtle.decrypt(algorithm, key, bytes) : unframe(bytes);
}

/** The vault key used while there is no key screen (encryption off). It protects nothing. */
export const plaintextCode = '0'.repeat(64);
