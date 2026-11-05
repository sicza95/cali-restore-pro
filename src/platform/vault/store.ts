import type { Envelope } from './crypto';

export type VaultRow = {
  envelope: Envelope;
  remembered?: CryptoKey;
  stamp: string;
  sharingIdentity?: Envelope;
};
export const vaultTable = 'accounts';
export const fileTable = 'encrypted-files';
export const projectTable = 'encrypted-projects';
export const accountRange = (account: string) => IDBKeyRange.bound([account], [account, []]);

export async function connect() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('calirestore-vault', 3);
    request.onupgradeneeded = (event) => {
      if (event.oldVersion < 1) request.result.createObjectStore(vaultTable);
      if (event.oldVersion < 2) request.result.createObjectStore(fileTable);
      request.result.createObjectStore(projectTable);
    };
    request.onblocked = () => reject(new Error('Close older vault tabs and retry'));
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
  });
}

export async function readVault(account: string) {
  const db = await connect();
  try {
    return await new Promise<VaultRow | undefined>((resolve, reject) => {
      const request = db.transaction(vaultTable).objectStore(vaultTable).get(account);
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
      const tx = db.transaction([vaultTable, fileTable, projectTable], 'readwrite', {
        durability: 'strict',
      });
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error ?? new Error('Vault changed or transaction aborted'));
      const store = tx.objectStore(vaultTable);
      const request = store.get(account);
      request.onsuccess = () => {
        if ((request.result as VaultRow | undefined)?.stamp !== expected) {
          tx.abort();
        } else if (next) {
          store.put(next, account);
        } else {
          store.delete(account);
          tx.objectStore(fileTable).delete(accountRange(account));
          tx.objectStore(projectTable).delete(accountRange(account));
        }
      };
    });
  } finally {
    db.close();
  }
}
