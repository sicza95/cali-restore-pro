import type { Envelope } from './crypto';

export type VaultRow = { envelope: Envelope; remembered?: CryptoKey; stamp: string };
const table = 'accounts';

async function connect() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('calirestore-vault', 1);
    request.onupgradeneeded = () => request.result.createObjectStore(table);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

export async function readVault(account: string) {
  const db = await connect();
  try {
    return await new Promise<VaultRow | undefined>((resolve, reject) => {
      const request = db.transaction(table).objectStore(table).get(account);
      request.onsuccess = () => resolve(request.result as VaultRow | undefined);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

export async function commitVault(
  account: string,
  expected: string | undefined,
  next: VaultRow | undefined,
) {
  const db = await connect();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(table, 'readwrite', { durability: 'strict' });
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error ?? new Error('Vault changed or transaction aborted'));
      const store = tx.objectStore(table);
      const request = store.get(account);
      request.onsuccess = () => {
        if ((request.result as VaultRow | undefined)?.stamp !== expected) {
          tx.abort();
        } else if (next) {
          store.put(next, account);
        } else {
          store.delete(account);
        }
      };
    });
  } finally {
    db.close();
  }
}
