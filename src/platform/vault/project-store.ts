import { open, seal } from './crypto';
import type { Envelope } from './crypto';
import { assertID } from './file-format';
import {
  accountRange,
  connect,
  fileTable,
  projectTable,
  vaultTable,
  estimateTable,
  presetTable,
  reportTable,
  journalTable,
  patternTable,
  thumbnailTable,
} from './store';
import type { VaultRow } from './store';
import { abortOnSignal, abortTransaction } from './transaction-abort';
import type { LocalFile } from './file-store';
import type { BackupDocuments } from './backup-documents';

export type JournalRef = { project: string; surface: string; source: string };
export type JournalWrite = { ref: JournalRef; expected: number; text: string };
type JournalRow = { revision: number; envelope: Envelope };

export type ProjectRow = { id: string; revision: number; envelope: Envelope };
export type PendingAttachment = { id: string; signal: AbortSignal };
export type RestoredOriginal = { id: string; header: LocalFile; parts: ArrayBuffer[] };

export function projectDocuments(
  root: CryptoKey,
  account: string,
  stamp: string,
  signal: AbortSignal,
  table:
    | typeof projectTable
    | typeof estimateTable
    | typeof presetTable
    | typeof reportTable
    | typeof patternTable = projectTable,
) {
  const purpose = (id: string, revision: number) =>
    table === projectTable
      ? (`project:${id}:${revision}` as const)
      : (`${table}:${id}:${revision}` as const);
  function journalKey({ project, surface, source }: JournalRef) {
    [project, surface, source].forEach(assertID);
    return [account, project, surface, source];
  }
  const journalPurpose = ({ project, surface, source }: JournalRef, revision: number) =>
    `surface-journal:${project}:${surface}:${source}:${revision}` as const;

  async function transact<T>(
    mode: IDBTransactionMode,
    work: (store: IDBObjectStore, finish: (result: T) => void, abort: () => void) => void,
    withFiles = false,
    operation = signal,
    withJournal = false,
    withDocuments = false,
    withThumbnails = false,
  ) {
    operation.throwIfAborted();
    const db = await connect();
    try {
      operation.throwIfAborted();
      return await new Promise<T>((resolve, reject) => {
        const tables = [vaultTable, table];
        if (withFiles) tables.push(fileTable);
        if (withJournal) tables.push(journalTable);
        if (withDocuments) tables.push(estimateTable, reportTable);
        if (withThumbnails) tables.push(thumbnailTable);
        const tx = db.transaction(tables, mode, { durability: 'strict' });
        let result: T;
        const abort = () => abortTransaction(tx);
        abortOnSignal(tx, operation);
        tx.oncomplete = () => {
          if (operation.aborted && !withFiles) reject(operation.reason);
          else resolve(result);
        };
        tx.onabort = () => {
          reject(
            operation.reason ??
              tx.error ??
              new Error('The vault or project changed. Reopen it and try again.'),
          );
        };
        const vault = tx.objectStore(vaultTable).get(account);
        vault.onsuccess = () => {
          if ((vault.result as VaultRow | undefined)?.stamp !== stamp) abort();
          else work(tx.objectStore(table), (value) => (result = value), abort);
        };
      });
    } finally {
      db.close();
    }
  }

  async function prepareJournal(write: JournalWrite) {
    const key = journalKey(write.ref);
    const revision = write.expected + 1;
    const envelope = await seal(root, account, journalPurpose(write.ref, revision), write.text);
    return { key, expected: write.expected, row: { revision, envelope } };
  }
  function putJournal(
    projectStore: IDBObjectStore,
    prepared: Awaited<ReturnType<typeof prepareJournal>>[],
    finish: () => void,
    abort: () => void,
  ) {
    const [next, ...rest] = prepared;
    if (!next) return finish();
    const store = projectStore.transaction.objectStore(journalTable);
    const request = store.get(next.key);
    request.onsuccess = () => {
      if (((request.result as JournalRow | undefined)?.revision ?? 0) !== next.expected)
        return abort();
      store.put(next.row, next.key);
      putJournal(projectStore, rest, finish, abort);
    };
  }

  return {
    async readJournal(ref: JournalRef) {
      const key = journalKey(ref);
      const row = await transact<JournalRow | undefined>(
        'readonly',
        (projects, finish) => {
          const request = projects.transaction.objectStore(journalTable).get(key);
          request.onsuccess = () => finish(request.result as JournalRow | undefined);
        },
        false,
        signal,
        true,
      );
      if (!row) return;
      const text = await open(root, account, journalPurpose(ref, row.revision), row.envelope);
      signal.throwIfAborted();
      return { revision: row.revision, text };
    },
    async saveJournal(write: JournalWrite, projectRevision: number) {
      const prepared = await prepareJournal(write);
      await transact<void>(
        'readwrite',
        (projects, finish, abort) => {
          const request = projects.get([account, write.ref.project]);
          request.onsuccess = () => {
            if ((request.result as ProjectRow | undefined)?.revision !== projectRevision)
              return abort();
            putJournal(projects, [prepared], () => finish(undefined), abort);
          };
        },
        false,
        signal,
        true,
      );
    },
    async restore(
      id: string,
      text: string,
      originals: RestoredOriginal[],
      documents: BackupDocuments = {},
    ) {
      assertID(id);
      if (table !== projectTable) throw new Error('Invalid restore store');
      signal.throwIfAborted();
      const envelope = await seal(root, account, purpose(id, 1), text);
      const prepared = await Promise.all(
        (
          [
            ['estimate', estimateTable],
            ['report', reportTable],
          ] as const
        ).flatMap(([kind, table]) =>
          documents[kind] === undefined
            ? []
            : [
                seal(root, account, `${table}:${id}:1`, documents[kind]).then((envelope) => ({
                  table,
                  envelope,
                })),
              ],
        ),
      );
      await transact<void>(
        'readwrite',
        (store, finish, abort) => {
          try {
            store.add({ id, revision: 1, envelope } satisfies ProjectRow, [account, id]);
            for (const { table, envelope } of prepared)
              store.transaction
                .objectStore(table)
                .add({ id, revision: 1, envelope } satisfies ProjectRow, [account, id]);
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
        signal,
        false,
        true,
      );
    },
    /**
     * Removes a project from this device for good, in one transaction: its document (at the
     * expected revision), estimate, report, drawing journals, files and cached thumbnails.
     * Callers check first that it was never hosted and that no drafts would be lost.
     */
    async remove(id: string, expected: number) {
      assertID(id);
      if (table !== projectTable) throw new Error('Invalid remove store');
      await transact<void>(
        'readwrite',
        (store, finish, abort) => {
          const request = store.get([account, id]);
          request.onsuccess = () => {
            if ((request.result as ProjectRow | undefined)?.revision !== expected) return abort();
            const tx = store.transaction;
            const own = IDBKeyRange.bound([account, id], [account, id, []]);
            store.delete([account, id]);
            tx.objectStore(estimateTable).delete([account, id]);
            tx.objectStore(reportTable).delete([account, id]);
            tx.objectStore(journalTable).delete(own);
            tx.objectStore(thumbnailTable).delete(own);
            const files = tx.objectStore(fileTable);
            const cursor = files.openCursor(accountRange(account));
            cursor.onsuccess = () => {
              const row = cursor.result;
              if (!row) return finish(undefined);
              const [, file, part] = row.key as [string, string, number?];
              if (part === undefined && (row.value as LocalFile | undefined)?.project === id)
                files.delete(IDBKeyRange.bound([account, file], [account, file, Infinity]));
              row.continue([account, file, []]);
            };
          };
        },
        true,
        signal,
        true,
        true,
        true,
      );
    },
    async backupRows(id: string) {
      assertID(id);
      if (table !== projectTable) throw new Error('Invalid backup store');
      const rows = await transact<(ProjectRow | undefined)[]>(
        'readonly',
        (store, finish) => {
          const tables = [projectTable, estimateTable, reportTable];
          const values: (ProjectRow | undefined)[] = [];
          let remaining = tables.length;
          tables.forEach((name, index) => {
            const request = store.transaction.objectStore(name).get([account, id]);
            request.onsuccess = () => {
              values[index] = request.result as ProjectRow | undefined;
              if (--remaining === 0) finish(values);
            };
          });
        },
        false,
        signal,
        false,
        true,
      );
      const texts = await Promise.all(
        rows.map((row, index) => {
          if (!row) return undefined;
          const name = ([projectTable, estimateTable, reportTable] as const)[index]!;
          const context =
            name === projectTable
              ? (`project:${id}:${row.revision}` as const)
              : (`${name}:${id}:${row.revision}` as const);
          return open(root, account, context, row.envelope);
        }),
      );
      signal.throwIfAborted();
      return {
        revision: rows[0]?.revision,
        project: texts[0],
        estimate: texts[1],
        report: texts[2],
      };
    },
    async changed(id: string, after: number) {
      assertID(id);
      const row = await transact<ProjectRow | undefined>('readonly', (store, finish) => {
        const request = store.get([account, id]);
        request.onsuccess = () => finish(request.result as ProjectRow | undefined);
      });
      if (!row || row.revision <= after) return;
      const text = await open(root, account, purpose(id, row.revision), row.envelope);
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
            text: await open(root, account, purpose(id, revision), envelope),
          };
        }),
      );
      signal.throwIfAborted();
      return result;
    },
    async save(
      id: string,
      expected: number,
      text: string,
      attachment?: PendingAttachment,
      journal?: JournalWrite | JournalWrite[],
    ) {
      // Several journals when one change moves more than one assessment (a photo removal, #67).
      const journals = journal ? [journal].flat() : [];
      if (journals.some((write) => table !== projectTable || write.ref.project !== id))
        throw new Error('Invalid surface journal project');
      const prepared = await Promise.all(journals.map(prepareJournal));
      assertID(id);
      const operation = attachment ? AbortSignal.any([signal, attachment.signal]) : signal;
      operation.throwIfAborted();
      if (attachment) assertID(attachment.id);
      const revision = expected + 1;
      const envelope = await seal(root, account, purpose(id, revision), text);
      await transact<void>(
        'readwrite',
        (store, finish, abort) => {
          const key = [account, id];
          const request = store.get(key);
          request.onsuccess = () => {
            if (((request.result as ProjectRow | undefined)?.revision ?? 0) !== expected)
              return abort();
            store.put({ id, revision, envelope } satisfies ProjectRow, key);
            if (attachment) {
              const files = store.transaction.objectStore(fileTable);
              const fileKey = [account, attachment.id];
              const file = files.get(fileKey);
              file.onsuccess = () => {
                const header = file.result as LocalFile | undefined;
                if (header?.project !== id || header.ready) return abort();
                files.put({ ...header, ready: true }, fileKey);
              };
            }
            putJournal(store, prepared, () => finish(undefined), abort);
          };
        },
        !!attachment,
        operation,
        prepared.length > 0,
      );
      return revision;
    },
  };
}
