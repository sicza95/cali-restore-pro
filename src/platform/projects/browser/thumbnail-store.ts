import { connect, thumbnailTable, vaultTable } from '../../vault/store';
import type { VaultRow } from '../../vault/store';
import { abortOnSignal, abortTransaction } from '../../vault/transaction-abort';
import { encrypt, decrypt } from '../../vault/aead';
import { assertID } from '../../vault/file-format';
import type { ThumbnailCache, ThumbnailKey } from './thumbnails';

const encode = new TextEncoder();
const maxBytes = 1024 * 1024;
const cacheVersion = 1;
/** Disposable, encrypted with the vault AEAD seam, and isolated by account/project/asset/version.
 * The stamp and lock signal prevent a stale handle resurrecting cache entries after a vault reset.
 */
export function vaultThumbnailCache(
  root: CryptoKey,
  account: string,
  stamp: string,
  locked: AbortSignal,
): ThumbnailCache {
  const keyFor = ({ project, id, version }: ThumbnailKey) => {
    assertID(project);
    assertID(id);
    if (!version || version.length > 128) throw new Error('Invalid asset version');
    return [account, project, id, version, cacheVersion];
  };
  async function parameters(ref: ThumbnailKey, iv: Uint8Array<ArrayBuffer>) {
    const context = encode.encode(JSON.stringify(['calirestore-thumbnail', ...keyFor(ref)]));
    const key = await crypto.subtle.deriveKey(
      { name: 'HKDF', hash: 'SHA-256', salt: encode.encode(ref.id), info: context },
      root,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    );
    return { key, algorithm: { name: 'AES-GCM', iv, additionalData: context, tagLength: 128 } };
  }
  async function run(ref: ThumbnailKey, operation: AbortSignal, bytes?: ArrayBuffer) {
    const key = keyFor(ref);
    operation.throwIfAborted();
    const db = await connect();
    try {
      operation.throwIfAborted();
      return await new Promise<ArrayBuffer | undefined>((resolve, reject) => {
        const tx = db.transaction([thumbnailTable, vaultTable], bytes ? 'readwrite' : 'readonly');
        abortOnSignal(tx, operation);
        let result: ArrayBuffer | undefined;
        tx.onabort = () => reject(operation.reason ?? tx.error ?? new Error('Vault changed'));
        tx.oncomplete = () => (operation.aborted ? reject(operation.reason) : resolve(result));
        const vault = tx.objectStore(vaultTable).get(account);
        vault.onsuccess = () => {
          if ((vault.result as VaultRow | undefined)?.stamp !== stamp) return abortTransaction(tx);
          const store = tx.objectStore(thumbnailTable);
          if (bytes) store.put(bytes, key);
          else {
            const read = store.get(key);
            read.onsuccess = () => {
              result = read.result as ArrayBuffer | undefined;
            };
          }
        };
      });
    } finally {
      db.close();
    }
  }
  return {
    async get(ref, signal) {
      const operation = AbortSignal.any([locked, signal]);
      const bytes = await run(ref, operation);
      if (!bytes) return;
      try {
        if (bytes.byteLength < 29 || bytes.byteLength > maxBytes + 28) return;
        const { key, algorithm } = await parameters(ref, new Uint8Array(bytes, 0, 12));
        const plain = await decrypt(algorithm, key, new Uint8Array(bytes, 12));
        operation.throwIfAborted();
        return new Blob([plain], { type: 'image/png' });
      } catch {
        operation.throwIfAborted();
        return undefined;
      }
    },
    async put(ref, blob, signal) {
      const operation = AbortSignal.any([locked, signal]);
      operation.throwIfAborted();
      if (!blob.size || blob.size > maxBytes) throw new Error('Invalid thumbnail size');
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const { key, algorithm } = await parameters(ref, iv);
      const encrypted = await encrypt(algorithm, key, await blob.arrayBuffer());
      const bytes = new Uint8Array(12 + encrypted.byteLength);
      bytes.set(iv);
      bytes.set(new Uint8Array(encrypted), 12);
      await run(ref, operation, bytes.buffer);
    },
  };
}
