import { connect, projectTable, revisionQueueTable, revisionSyncTable, vaultTable } from './store';
import type { VaultRow } from './store';
import { abortOnSignal, abortTransaction } from './transaction-abort';

export type RevisionTransaction = <T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore, result: (value: T) => void, sync: IDBObjectStore) => void,
) => Promise<T>;

// One strict-durability transaction over the vault, project, queue and sync tables. It aborts
// when the signal aborts or the vault row's stamp no longer matches, so a lock or a vault
// replaced on another tab never writes into the new vault.
export function revisionTransaction(
  account: string,
  stamp: () => string,
  signal: AbortSignal,
): RevisionTransaction {
  return async function transaction<T>(
    mode: IDBTransactionMode,
    run: (store: IDBObjectStore, result: (value: T) => void, sync: IDBObjectStore) => void,
  ) {
    signal.throwIfAborted();
    const db = await connect();
    try {
      signal.throwIfAborted();
      return await new Promise<T>((resolve, reject) => {
        const tx = db.transaction(
          [vaultTable, projectTable, revisionQueueTable, revisionSyncTable],
          mode,
          { durability: 'strict' },
        );
        let value: T;
        abortOnSignal(tx, signal);
        tx.onabort = () => {
          reject(signal.reason ?? tx.error ?? new Error('Vault changed'));
        };
        tx.oncomplete = () => {
          if (signal.aborted) reject(signal.reason);
          else resolve(value);
        };
        const vault = tx.objectStore(vaultTable).get(account);
        vault.onsuccess = () => {
          if ((vault.result as VaultRow | undefined)?.stamp !== stamp()) abortTransaction(tx);
          else
            run(
              tx.objectStore(revisionQueueTable),
              (next) => (value = next),
              tx.objectStore(revisionSyncTable),
            );
        };
      });
    } finally {
      db.close();
    }
  };
}
