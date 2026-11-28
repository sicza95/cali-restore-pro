import {
  binEntryTable,
  binFenceTable,
  binOutboxTable,
  binPayloadTable,
  binPinTable,
  connect,
  estimateTable,
  fileTable,
  journalTable,
  projectTable,
  reportTable,
  revisionQueueTable,
  revisionSyncTable,
  thumbnailTable,
  vaultTable,
  type VaultRow,
} from './store';
import { abortOnSignal, abortTransaction } from './transaction-abort';

/** Every table a Bin commit may touch: graph, documents, Bin stores, outbox and sync state. */
const tables = [
  vaultTable,
  projectTable,
  journalTable,
  fileTable,
  estimateTable,
  reportTable,
  thumbnailTable,
  binEntryTable,
  binPayloadTable,
  binPinTable,
  binFenceTable,
  binOutboxTable,
  revisionSyncTable,
  revisionQueueTable,
];

export type BinTransact = <T>(
  mode: IDBTransactionMode,
  work: (tx: IDBTransaction, finish: (value: T) => void, abort: () => void) => void,
) => Promise<T>;

/** One strict transaction checked against the vault stamp; any failed check aborts all of it. */
export function binTransaction(account: string, stamp: string, signal: AbortSignal): BinTransact {
  return async function transact<T>(
    mode: IDBTransactionMode,
    work: (tx: IDBTransaction, finish: (value: T) => void, abort: () => void) => void,
  ) {
    signal.throwIfAborted();
    const db = await connect();
    try {
      return await new Promise<T>((resolve, reject) => {
        const tx = db.transaction(tables, mode, { durability: 'strict' });
        let result: T;
        abortOnSignal(tx, signal);
        tx.oncomplete = () => (signal.aborted ? reject(signal.reason) : resolve(result));
        tx.onabort = () =>
          reject(
            signal.reason ??
              tx.error ??
              new Error('The vault or project changed. Reopen it and try again.'),
          );
        const vault = tx.objectStore(vaultTable).get(account);
        vault.onsuccess = () => {
          if ((vault.result as VaultRow | undefined)?.stamp !== stamp) abortTransaction(tx);
          else
            work(
              tx,
              (value) => (result = value),
              () => abortTransaction(tx),
            );
        };
      });
    } finally {
      db.close();
    }
  };
}

/** Runs one request and continues with its result inside the same transaction. */
export const getThen = (store: IDBObjectStore, k: IDBValidKey, next: (value: unknown) => void) => {
  const request = store.get(k);
  request.onsuccess = () => next(request.result);
};
