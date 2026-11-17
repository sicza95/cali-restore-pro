import { open, seal } from './crypto';
import type { Envelope } from './crypto';
import { assertID } from './file-format';
import { connect, recipientReportTable, vaultTable } from './store';
import type { VaultRow } from './store';
import { abortOnSignal, abortTransaction } from './transaction-abort';

/** Which shared project and grant a recipient's own report draft belongs to (ADR 0008). */
export type RecipientReportKey = { project: string; invitation: string };
type Row = RecipientReportKey & { revision: number; envelope: Envelope };

/**
 * A recipient's own report drafts on this device. Rows live in their own table under
 * [account, project, invitation], so the owner's project, estimate and report tables, and
 * therefore the owner's portable backups, never read them. Each row is sealed with the
 * recipient's vault key and bound to its project, invitation and revision.
 */
export function recipientReportDocuments(
  root: CryptoKey,
  account: string,
  stamp: string,
  signal: AbortSignal,
) {
  const keyOf = ({ project, invitation }: RecipientReportKey) => {
    assertID(project);
    assertID(invitation);
    return [account, project, invitation];
  };
  const purpose = ({ project, invitation }: RecipientReportKey, revision: number) =>
    `${recipientReportTable}:${project}:${invitation}:${revision}` as const;

  async function transact<T>(
    mode: IDBTransactionMode,
    work: (store: IDBObjectStore, finish: (result: T) => void, abort: () => void) => void,
  ) {
    signal.throwIfAborted();
    const db = await connect();
    try {
      signal.throwIfAborted();
      return await new Promise<T>((resolve, reject) => {
        const tx = db.transaction([vaultTable, recipientReportTable], mode, {
          durability: 'strict',
        });
        let result: T;
        const abort = () => abortTransaction(tx);
        abortOnSignal(tx, signal);
        tx.oncomplete = () => (signal.aborted ? reject(signal.reason) : resolve(result));
        tx.onabort = () =>
          reject(signal.reason ?? tx.error ?? new Error('The report changed. Reopen it.'));
        const vault = tx.objectStore(vaultTable).get(account);
        vault.onsuccess = () => {
          if ((vault.result as VaultRow | undefined)?.stamp !== stamp) abort();
          else work(tx.objectStore(recipientReportTable), (value) => (result = value), abort);
        };
      });
    } finally {
      db.close();
    }
  }

  async function read(row: Row) {
    const text = await open(root, account, purpose(row, row.revision), row.envelope);
    signal.throwIfAborted();
    return { project: row.project, invitation: row.invitation, revision: row.revision, text };
  }

  return {
    async load(key: RecipientReportKey) {
      const id = keyOf(key);
      const row = await transact<Row | undefined>('readonly', (store, finish) => {
        const request = store.get(id);
        request.onsuccess = () => finish(request.result as Row | undefined);
      });
      return row ? read(row) : undefined;
    },
    async list() {
      const rows = await transact<Row[]>('readonly', (store, finish) => {
        const request = store.getAll(IDBKeyRange.bound([account], [account, []]));
        request.onsuccess = () => finish(request.result as Row[]);
      });
      return Promise.all(rows.map(read));
    },
    async save(key: RecipientReportKey, expected: number, text: string) {
      const id = keyOf(key);
      const revision = expected + 1;
      const envelope = await seal(root, account, purpose(key, revision), text);
      await transact<void>('readwrite', (store, finish, abort) => {
        const request = store.get(id);
        request.onsuccess = () => {
          if (((request.result as Row | undefined)?.revision ?? 0) !== expected) return abort();
          store.put({ ...key, revision, envelope } satisfies Row, id);
          finish(undefined);
        };
      });
      return revision;
    },
    async remove(key: RecipientReportKey, expected: number) {
      const id = keyOf(key);
      await transact<void>('readwrite', (store, finish, abort) => {
        const request = store.get(id);
        request.onsuccess = () => {
          if ((request.result as Row | undefined)?.revision !== expected) return abort();
          store.delete(id);
          finish(undefined);
        };
      });
    },
  };
}
