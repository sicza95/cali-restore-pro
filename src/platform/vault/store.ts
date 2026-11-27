import type { Envelope } from './crypto';

export type VaultRow = {
  envelope: Envelope;
  remembered?: CryptoKey;
  stamp: string;
  sharingIdentity?: Envelope;
};
export const vaultTable = 'accounts';
export const fileTable = 'encrypted-files';
export const thumbnailTable = 'browser-thumbnails';
export const projectTable = 'encrypted-projects';
export const estimateTable = 'encrypted-estimates';
export const journalTable = 'encrypted-surface-journals';
export const patternTable = 'encrypted-pattern-presets';
export const reportTable = 'encrypted-reports';
export const presetTable = 'encrypted-estimate-presets';
// A recipient's own report drafts, keyed by [account, project, invitation] (ADR 0008).
export const recipientReportTable = 'encrypted-recipient-reports';
export const revisionSyncTable = 'revision-sync';
export const revisionQueueTable = 'revision-queue';
// Bin (version 11): entries, sealed payload chunks, asset pins, lifecycle outbox, terminal fences.
export const binEntryTable = 'bin-entries';
export const binPayloadTable = 'bin-payloads';
export const binPinTable = 'bin-pins';
export const binOutboxTable = 'bin-outbox';
export const binFenceTable = 'bin-fences';
export const binTables = [
  binEntryTable,
  binPayloadTable,
  binPinTable,
  binOutboxTable,
  binFenceTable,
];
export const accountRange = (account: string) => IDBKeyRange.bound([account], [account, []]);

export async function connect() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('calirestore-vault', 11);
    request.onupgradeneeded = (event) => {
      if (event.oldVersion < 1) request.result.createObjectStore(vaultTable);
      if (event.oldVersion < 2) request.result.createObjectStore(fileTable);
      if (event.oldVersion < 3) request.result.createObjectStore(projectTable);
      if (event.oldVersion < 4) request.result.createObjectStore(revisionQueueTable);
      if (event.oldVersion < 5) request.result.createObjectStore(revisionSyncTable);
      if (event.oldVersion < 6) {
        request.result.createObjectStore(estimateTable);
        request.result.createObjectStore(presetTable);
      }
      if (event.oldVersion < 7) request.result.createObjectStore(reportTable);
      if (event.oldVersion < 8) {
        request.result.createObjectStore(journalTable);
        request.result.createObjectStore(patternTable);
      }
      if (event.oldVersion < 9) request.result.createObjectStore(recipientReportTable);
      if (event.oldVersion < 10) request.result.createObjectStore(thumbnailTable);
      if (event.oldVersion < 11)
        for (const name of binTables) request.result.createObjectStore(name);
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
      const tx = db.transaction(
        [
          vaultTable,
          fileTable,
          thumbnailTable,
          projectTable,
          revisionQueueTable,
          revisionSyncTable,
          estimateTable,
          presetTable,
          reportTable,
          journalTable,
          patternTable,
          recipientReportTable,
          ...binTables,
        ],
        'readwrite',
        {
          durability: 'strict',
        },
      );
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
          tx.objectStore(thumbnailTable).delete(accountRange(account));
          tx.objectStore(projectTable).delete(accountRange(account));
          tx.objectStore(revisionQueueTable).delete(accountRange(account));
          tx.objectStore(revisionSyncTable).delete(accountRange(account));
          tx.objectStore(estimateTable).delete(accountRange(account));
          tx.objectStore(presetTable).delete(accountRange(account));
          tx.objectStore(reportTable).delete(accountRange(account));
          tx.objectStore(journalTable).delete(accountRange(account));
          tx.objectStore(patternTable).delete(accountRange(account));
          tx.objectStore(recipientReportTable).delete(accountRange(account));
          for (const name of binTables) tx.objectStore(name).delete(accountRange(account));
        }
      };
    });
  } finally {
    db.close();
  }
}
