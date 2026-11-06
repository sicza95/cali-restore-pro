import { open, seal } from './crypto';
import type { Envelope } from './crypto';
import { assertID } from './file-format';
import { accountRange, connect, fileTable, projectTable, vaultTable } from './store';
import type { VaultRow } from './store';
import type { LocalFile } from './file-store';

export type ProjectRow = { id: string; revision: number; envelope: Envelope };
export type RestoredOriginal = { id: string; header: LocalFile; parts: ArrayBuffer[] };

export function projectDocuments(
  root: CryptoKey,
  account: string,
  stamp: string,
  signal: AbortSignal,
) {
  async function transact<T>(
    mode: IDBTransactionMode,
    work: (store: IDBObjectStore, finish: (result: T) => void, abort: () => void) => void,
    withFiles = false,
  ) {
    signal.throwIfAborted();
    const db = await connect();
    try {
      signal.throwIfAborted();
      return await new Promise<T>((resolve, reject) => {
        const tables = [vaultTable, projectTable];
        if (withFiles) tables.push(fileTable);
        const tx = db.transaction(tables, mode, { durability: 'strict' });
        let result: T;
        const abort = () => tx.abort();
        const cancel = () => {
          try {
            abort();
          } catch (error) {
            // The commit may have completed before its completion event was delivered.
            if (!(error instanceof DOMException) || error.name !== 'InvalidStateError') throw error;
          }
        };
        signal.addEventListener('abort', cancel, { once: true });
        tx.oncomplete = () => {
          signal.removeEventListener('abort', cancel);
          if (signal.aborted && !withFiles) reject(signal.reason);
          else resolve(result);
        };
        tx.onabort = () => {
          signal.removeEventListener('abort', cancel);
          reject(
            signal.reason ??
              tx.error ??
              new Error('The vault or project changed. Reopen it and try again.'),
          );
        };
        const vault = tx.objectStore(vaultTable).get(account);
        vault.onsuccess = () => {
          if ((vault.result as VaultRow | undefined)?.stamp !== stamp) abort();
          else work(tx.objectStore(projectTable), (value) => (result = value), abort);
        };
      });
    } finally {
      db.close();
    }
  }

  return {
    async restore(id: string, text: string, originals: RestoredOriginal[]) {
      assertID(id);
      signal.throwIfAborted();
      const envelope = await seal(root, account, `project:${id}:1`, text);
      await transact<void>(
        'readwrite',
        (store, finish, abort) => {
          try {
            store.add({ id, revision: 1, envelope } satisfies ProjectRow, [account, id]);
            const files = store.transaction.objectStore(fileTable);
            for (const original of originals) {
              files.add(original.header, [account, original.id]);
              original.parts.forEach((part, index) =>
                files.add(part, [account, original.id, index]),
              );
            }
            finish(undefined);
          } catch {
            abort();
          }
        },
        true,
      );
    },
    async changed(id: string, after: number) {
      assertID(id);
      const row = await transact<ProjectRow | undefined>('readonly', (store, finish) => {
        const request = store.get([account, id]);
        request.onsuccess = () => finish(request.result as ProjectRow | undefined);
      });
      if (!row || row.revision <= after) return;
      const text = await open(root, account, `project:${id}:${row.revision}`, row.envelope);
      signal.throwIfAborted();
      return { revision: row.revision, text };
    },
    async list() {
      const rows = await transact<ProjectRow[]>('readonly', (store, finish) => {
        const request = store.getAll(accountRange(account));
        request.onsuccess = () => finish(request.result as ProjectRow[]);
      });
      const result = await Promise.all(
        rows.map(async ({ id, revision, envelope }) => {
          assertID(id);
          return {
            id,
            revision,
            text: await open(root, account, `project:${id}:${revision}`, envelope),
          };
        }),
      );
      signal.throwIfAborted();
      return result;
    },
    async save(id: string, expected: number, text: string) {
      assertID(id);
      const revision = expected + 1;
      const envelope = await seal(root, account, `project:${id}:${revision}`, text);
      await transact<void>('readwrite', (store, finish, abort) => {
        const key = [account, id];
        const request = store.get(key);
        request.onsuccess = () => {
          if (((request.result as ProjectRow | undefined)?.revision ?? 0) !== expected) abort();
          else {
            store.put({ id, revision, envelope } satisfies ProjectRow, key);
            finish(undefined);
          }
        };
      });
      return revision;
    },
  };
}
