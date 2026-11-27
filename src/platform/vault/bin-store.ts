import type { BinBundle } from '../projects/bin/bundle';
import type { BinEntry, BinManifest, BinTerminalFence } from '../projects/bin/types';
import { open, seal, type Envelope } from './crypto';
import { assertID } from './file-format';
import type { LocalFile } from './file-store';
import type { JournalWrite, ProjectRow } from './project-store';
import {
  accountRange,
  binEntryTable,
  binFenceTable,
  binPayloadTable,
  binPinTable,
  connect,
  estimateTable,
  fileTable,
  journalTable,
  projectTable,
  reportTable,
  thumbnailTable,
  vaultTable,
  type VaultRow,
} from './store';
import { abortOnSignal, abortTransaction } from './transaction-abort';

/** Name and original path, sealed like every other document. */
export type BinDisplay = { name: string; path: string[] };
export type BinEntryRow = {
  entry: BinEntry;
  manifest: Envelope;
  display: Envelope;
  /** A trashed whole project keeps its sealed row here, untouched, until restore or purge. */
  projectRow?: ProjectRow;
};
export type SealedBin = { row: BinEntryRow; chunks: Envelope[]; pins: string[] };
/** Next project row for a child change, sealed outside the transaction. */
/** expected null: the project row must be absent (a whole project coming back with changes). */
export type ProjectWrite = { id: string; expected: number | null; next: ProjectRow };

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
];
const base64 = (bytes: Uint8Array) =>
  btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(''));
const unbase64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

/** Local Bin persistence. Every mutation is one strict transaction checked against the vault stamp. */
export function binDocuments(root: CryptoKey, account: string, stamp: string, signal: AbortSignal) {
  const key = (...parts: (string | number | never[])[]) => [account, ...parts];
  async function transact<T>(
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
  }
  /** Runs requests in order; aborts the whole transaction when a check fails. */
  const get = (store: IDBObjectStore, k: IDBValidKey, next: (value: unknown) => void) => {
    const request = store.get(k);
    request.onsuccess = () => next(request.result);
  };

  function putRecovery(tx: IDBTransaction, sealed: SealedBin) {
    const id = sealed.row.entry.deletionId;
    tx.objectStore(binEntryTable).put(sealed.row, key(id));
    sealed.chunks.forEach((chunk, index) =>
      tx.objectStore(binPayloadTable).put(chunk, key(id, index)),
    );
    for (const asset of sealed.pins) tx.objectStore(binPinTable).put(id, key(asset, id));
  }
  function dropRecovery(tx: IDBTransaction, row: BinEntryRow, manifestAssets: readonly string[]) {
    const id = row.entry.deletionId;
    tx.objectStore(binEntryTable).delete(key(id));
    tx.objectStore(binPayloadTable).delete(IDBKeyRange.bound(key(id), key(id, Infinity)));
    for (const asset of manifestAssets) tx.objectStore(binPinTable).delete(key(asset, id));
  }
  function checkJournals(
    tx: IDBTransaction,
    journals: readonly JournalWrite[],
    done: () => void,
    abort: () => void,
  ) {
    const [next, ...rest] = journals;
    if (!next) return done();
    const { project, surface, source } = next.ref;
    get(tx.objectStore(journalTable), key(project, surface, source), (row) => {
      if (((row as { revision: number } | undefined)?.revision ?? 0) !== next.expected)
        return abort();
      checkJournals(tx, rest, done, abort);
    });
  }

  return {
    async seal(bundle: BinBundle, entry: BinEntry, display: BinDisplay): Promise<SealedBin> {
      const id = entry.deletionId;
      assertID(id);
      return {
        row: {
          entry: { ...entry, manifest: bundle.ref, coverage: bundle.manifest.coverage },
          manifest: await seal(
            root,
            account,
            `bin:${id}:manifest`,
            JSON.stringify(bundle.manifest),
          ),
          display: await seal(root, account, `bin:${id}:display`, JSON.stringify(display)),
        },
        chunks: await Promise.all(
          bundle.chunks.map((chunk, index) =>
            seal(root, account, `bin:${id}:${index}`, base64(chunk)),
          ),
        ),
        pins: bundle.manifest.assets,
      };
    },
    async sealProject(id: string, revision: number, text: string): Promise<ProjectRow> {
      return {
        id,
        revision,
        envelope: await seal(root, account, `project:${id}:${revision}`, text),
      };
    },

    /**
     * Moves a child subtree (project write) or a whole never-hosted project (row moved into the
     * entry) into Bin. The drawing-journal revisions are checked unchanged in the same commit.
     */
    trash(
      sealed: SealedBin,
      change: ProjectWrite | { id: string; expected: number; whole: true },
      journals: readonly JournalWrite[],
    ) {
      return transact<void>('readwrite', (tx, finish, abort) => {
        const projects = tx.objectStore(projectTable);
        get(projects, key(change.id), (value) => {
          const current = value as ProjectRow | undefined;
          if (current?.revision !== change.expected) return abort();
          checkJournals(
            tx,
            journals,
            () => {
              if ('whole' in change) {
                putRecovery(tx, { ...sealed, row: { ...sealed.row, projectRow: current } });
                projects.delete(key(change.id));
              } else {
                putRecovery(tx, sealed);
                projects.put(change.next, key(change.id));
              }
              finish(undefined);
            },
            abort,
          );
        });
      });
    },

    async list(): Promise<{ entry: BinEntry; display: BinDisplay }[]> {
      const rows = await transact<BinEntryRow[]>('readonly', (tx, finish) => {
        const request = tx.objectStore(binEntryTable).getAll(accountRange(account));
        request.onsuccess = () => finish(request.result as BinEntryRow[]);
      });
      return Promise.all(
        rows.map(async (row) => ({
          entry: row.entry,
          display: JSON.parse(
            await open(root, account, `bin:${row.entry.deletionId}:display`, row.display),
          ) as BinDisplay,
        })),
      );
    },

    async payload(
      deletionId: string,
    ): Promise<{ row: BinEntryRow; manifest: BinManifest; chunks: Uint8Array<ArrayBuffer>[] }> {
      assertID(deletionId);
      const { row, chunks } = await transact<{ row?: BinEntryRow; chunks: Envelope[] }>(
        'readonly',
        (tx, finish) => {
          get(tx.objectStore(binEntryTable), key(deletionId), (value) => {
            const request = tx
              .objectStore(binPayloadTable)
              .getAll(IDBKeyRange.bound(key(deletionId), key(deletionId, Infinity)));
            request.onsuccess = () =>
              finish({
                row: value as BinEntryRow | undefined,
                chunks: request.result as Envelope[],
              });
          });
        },
      );
      if (!row) throw new Error('Bin entry not found');
      const manifest = JSON.parse(
        await open(root, account, `bin:${deletionId}:manifest`, row.manifest),
      ) as BinManifest;
      const opened = await Promise.all(
        chunks.map(async (chunk, index) =>
          unbase64(await open(root, account, `bin:${deletionId}:${index}`, chunk)),
        ),
      );
      return { row, manifest, chunks: opened };
    },

    /** Stored bytes of a ready local original, undefined when it is not on this device. */
    async assetBytes(id: string) {
      assertID(id);
      const header = await transact<LocalFile | undefined>('readonly', (tx, finish) =>
        get(tx.objectStore(fileTable), key(id), (value) => finish(value as LocalFile | undefined)),
      );
      return header?.ready ? header.sourceBytes + header.manifestBytes : undefined;
    },

    /**
     * Applies terminal transitions in one commit: each entry must still be at the version the
     * plan expected. Restores write the project (or put a whole project row back); purges also
     * remove collectable files and, for a project, every project-scoped row.
     */
    finish(change: {
      transitions: readonly BinEntry[];
      manifests: ReadonlyMap<string, readonly string[]>;
      fences: readonly BinTerminalFence[];
      project?: ProjectWrite | { id: string; restoreRowFrom: string };
      purgeProject?: string;
      collectable?: readonly string[];
    }) {
      return transact<void>('readwrite', (tx, finish, abort) => {
        const entries = tx.objectStore(binEntryTable);
        const rows = new Map<string, BinEntryRow>();
        const verify = (index: number) => {
          const next = change.transitions[index];
          if (!next) return applyProject();
          get(entries, key(next.deletionId), (value) => {
            const row = value as BinEntryRow | undefined;
            if (!row || row.entry.state !== 'retained' || row.entry.version !== next.version - 1)
              return abort();
            rows.set(next.deletionId, row);
            verify(index + 1);
          });
        };
        const applyProject = () => {
          const projects = tx.objectStore(projectTable);
          const target = change.project;
          if (!target) return commit();
          get(projects, key(target.id), (value) => {
            const current = value as ProjectRow | undefined;
            if ('restoreRowFrom' in target) {
              const saved = rows.get(target.restoreRowFrom)?.projectRow;
              if (current || !saved) return abort();
              projects.put(saved, key(target.id));
            } else {
              if ((current?.revision ?? null) !== target.expected) return abort();
              projects.put(target.next, key(target.id));
            }
            commit();
          });
        };
        const commit = () => {
          for (const [id, row] of rows) dropRecovery(tx, row, change.manifests.get(id) ?? []);
          for (const fence of change.fences) {
            const { entity } = fence;
            const entityId =
              entity.kind === 'project'
                ? entity.projectId
                : entity.kind === 'object'
                  ? entity.objectId
                  : entity.surfaceId;
            tx.objectStore(binFenceTable).put(
              fence,
              key(entity.projectId, entityId, fence.deletionId),
            );
          }
          const files = () => removeFiles(tx, change.collectable ?? [], () => finish(undefined));
          if (change.purgeProject) removeProjectRows(tx, change.purgeProject, files);
          else files();
        };
        verify(0);
      });
    },
  };

  /** The internal hard-removal primitive, used only by a project purge. */
  function removeProjectRows(tx: IDBTransaction, id: string, done: () => void) {
    const own = IDBKeyRange.bound(key(id), key(id, []));
    tx.objectStore(projectTable).delete(key(id));
    tx.objectStore(estimateTable).delete(key(id));
    tx.objectStore(reportTable).delete(key(id));
    tx.objectStore(journalTable).delete(own);
    tx.objectStore(thumbnailTable).delete(own);
    const files = tx.objectStore(fileTable);
    const cursor = files.openCursor(accountRange(account));
    cursor.onsuccess = () => {
      const row = cursor.result;
      if (!row) return done();
      const [, file, part] = row.key as [string, string, number?];
      if (part === undefined && (row.value as LocalFile | undefined)?.project === id)
        files.delete(IDBKeyRange.bound(key(file), key(file, Infinity)));
      row.continue([account, file, []]);
    };
  }
  /** Deletes collectable files, skipping any that another Bin entry still pins. */
  function removeFiles(tx: IDBTransaction, ids: readonly string[], done: () => void) {
    const [next, ...rest] = ids;
    if (!next) return done();
    const pins = tx
      .objectStore(binPinTable)
      .getAllKeys(IDBKeyRange.bound(key(next), key(next, [])));
    pins.onsuccess = () => {
      if (!pins.result.length)
        tx.objectStore(fileTable).delete(IDBKeyRange.bound(key(next), key(next, Infinity)));
      removeFiles(tx, rest, done);
    };
  }
}
