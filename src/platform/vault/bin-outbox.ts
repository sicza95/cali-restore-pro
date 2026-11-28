import type { HostedChunk, HostedCommand, HostedOutcome } from '../projects/bin/hosted-remote';
import type { RestoreOptions } from '../projects/bin/restore-prep';
import type { BinFailureCode, BinLifecycleIntent, BinPendingStage } from '../projects/bin/types';
import type { BinEntryRow } from './bin-store';
import { binTransaction, getThen } from './bin-transaction';
import type { SyncCheckpoint } from './revision-queue';
import type { ProjectRow } from './project-store';
import {
  accountRange,
  binEntryTable,
  binOutboxTable,
  projectTable,
  revisionQueueTable,
  revisionSyncTable,
} from './store';

/**
 * A hosted lifecycle command waiting for, or sent to, the server. The local change is already
 * committed for trash; while a row remains in the outbox, ordinary sync waits, so the
 * graph change reaches the server only together with its Bin entry.
 */
export type BinOutboxRow = {
  operationId: string;
  deletionId: string;
  projectId: string;
  intent: Extract<BinLifecycleIntent, 'trash' | 'restore'>;
  stage: BinPendingStage;
  /** Set on dispatch and kept unchanged so a lost response is replayed byte for byte. */
  command?: HostedCommand;
  chunks?: HostedChunk[];
  /** Sync checkpoint the head was sealed against, and the local revision it carries. */
  checkpoint?: SyncCheckpoint;
  localRevision?: number;
  failure?: BinFailureCode;
  /** Server head revision when the conflict was seen; retried once the checkpoint moves on. */
  conflictAt?: number;
  /** Restore choices, reapplied when a lost restore response is reconciled. */
  restore?: RestoreOptions;
  restoreAt?: number;
};

const sameCheckpoint = (a: SyncCheckpoint | undefined, b: SyncCheckpoint) =>
  a?.epoch === b.epoch && a.revision === b.revision && a.localRevision === b.localRevision;

/** Moves the checkpoint past an accepted head; aborts if sync moved it meanwhile. */
export function advanceCheckpoint(
  tx: IDBTransaction,
  key: (...parts: string[]) => IDBValidKey,
  base: SyncCheckpoint,
  head: HostedOutcome['head'],
  localRevision: number,
  next: () => void,
  abort: () => void,
  requireUnpaused = false,
) {
  const sync = tx.objectStore(revisionSyncTable);
  getThen(sync, key(base.project), (value) => {
    const current = value as SyncCheckpoint | undefined;
    if (
      !sameCheckpoint(current, base) ||
      head?.epoch !== base.epoch ||
      (requireUnpaused && current?.paused)
    )
      return abort();
    sync.put(
      {
        ...base,
        paused: current?.paused,
        revision: head.revision,
        localRevision,
      } satisfies SyncCheckpoint,
      key(base.project),
    );
    next();
  });
}

export function binOutbox(account: string, stamp: string, signal: AbortSignal) {
  const transact = binTransaction(account, stamp, signal);
  const key = (...parts: string[]) => [account, ...parts];
  const rowKey = (row: Pick<BinOutboxRow, 'projectId' | 'operationId'>) =>
    key(row.projectId, row.operationId);
  /** Mirrors the row's stage on its Bin entry so the Bin page can show it. */
  function mirror(tx: IDBTransaction, row: BinOutboxRow, abort: () => void) {
    const entries = tx.objectStore(binEntryTable);
    getThen(entries, key(row.deletionId), (value) => {
      const saved = value as BinEntryRow | undefined;
      if (!saved) return abort();
      const pending = {
        intent: row.intent,
        operationId: row.operationId,
        stage: row.stage,
        ...(row.failure ? { failure: row.failure } : {}),
      };
      entries.put({ ...saved, entry: { ...saved.entry, pending } }, key(row.deletionId));
    });
  }
  /** Replaces a row only while it is still the one the caller read. */
  const replace = (previous: BinOutboxRow, next: BinOutboxRow) =>
    transact<void>('readwrite', (tx, finish, abort) => {
      const outbox = tx.objectStore(binOutboxTable);
      getThen(outbox, rowKey(previous), (value) => {
        const current = value as BinOutboxRow | undefined;
        if (
          current?.stage !== previous.stage ||
          current.command?.digest !== previous.command?.digest
        )
          return abort();
        outbox.put(next, rowKey(next));
        mirror(tx, next, abort);
        finish(undefined);
      });
    });

  return {
    /** Refresh an unchanged device copy before planning against a newer cloud head. */
    refreshProject: (
      base: SyncCheckpoint,
      next: ProjectRow,
      head: NonNullable<HostedOutcome['head']>,
    ) =>
      transact<void>('readwrite', (tx, finish, abort) => {
        const project = key(base.project);
        const pending = tx
          .objectStore(binOutboxTable)
          .getKey(IDBKeyRange.bound(project, [...project, []]));
        pending.onsuccess = () => {
          if (pending.result !== undefined) return abort();
          getThen(tx.objectStore(revisionQueueTable), project, (draft) => {
            if (draft) return abort();
            const projects = tx.objectStore(projectTable);
            getThen(projects, project, (current) => {
              if ((current as typeof next | undefined)?.revision !== base.localRevision)
                return abort();
              advanceCheckpoint(
                tx,
                key,
                base,
                head,
                next.revision,
                () => {
                  projects.put(next, project);
                  finish(undefined);
                },
                abort,
                true,
              );
            });
          });
        };
      }),
    list: () =>
      transact<BinOutboxRow[]>('readonly', (tx, finish) => {
        const request = tx.objectStore(binOutboxTable).getAll(accountRange(account));
        request.onsuccess = () => finish(request.result as BinOutboxRow[]);
      }),
    replace,
    /** Commits an accepted trash: checkpoint, entry deadline and version, and the row together. */
    acceptTrash: (row: BinOutboxRow, outcome: HostedOutcome) =>
      transact<void>('readwrite', (tx, finish, abort) => {
        const outbox = tx.objectStore(binOutboxTable);
        getThen(outbox, rowKey(row), (value) => {
          const current = value as BinOutboxRow | undefined;
          if (current?.command?.digest !== row.command?.digest || !row.checkpoint) return abort();
          advanceCheckpoint(
            tx,
            key,
            row.checkpoint,
            outcome.head,
            row.localRevision!,
            () => {
              const entries = tx.objectStore(binEntryTable);
              getThen(entries, key(row.deletionId), (saved) => {
                const entryRow = saved as BinEntryRow | undefined;
                const deadline = outcome.recoverUntil[row.deletionId];
                if (!entryRow || !deadline) return abort();
                entries.put(
                  {
                    ...entryRow,
                    entry: {
                      ...entryRow.entry,
                      provisional: false,
                      pending: null,
                      recoverUntil: Date.parse(deadline),
                      version: outcome.versions[row.deletionId] ?? entryRow.entry.version,
                    },
                  },
                  key(row.deletionId),
                );
                outbox.delete(rowKey(row));
                finish(undefined);
              });
            },
            abort,
          );
        });
      }),
    /** Records a command before it is sent, so a lost response can be replayed. */
    add: (row: BinOutboxRow) =>
      transact<void>('readwrite', (tx, finish, abort) => {
        const outbox = tx.objectStore(binOutboxTable);
        const project = key(row.projectId);
        const pending = outbox.getKey(IDBKeyRange.bound(project, [...project, []]));
        pending.onsuccess = () => {
          if (pending.result !== undefined) return abort();
          getThen(tx.objectStore(revisionQueueTable), project, (draft) => {
            if (draft) return abort();
            getThen(tx.objectStore(revisionSyncTable), project, (value) => {
              const checkpoint = value as SyncCheckpoint | undefined;
              if (
                !row.checkpoint ||
                checkpoint?.paused ||
                !sameCheckpoint(checkpoint, row.checkpoint)
              )
                return abort();
              getThen(tx.objectStore(projectTable), project, (document) => {
                if ((document as ProjectRow | undefined)?.revision !== row.localRevision)
                  return abort();
                outbox.add(row, rowKey(row));
                mirror(tx, row, abort);
                finish(undefined);
              });
            });
          });
        };
      }),
    /** Ends a hosted trash that no longer applies; the entry stays as a local recovery copy. */
    release: (row: BinOutboxRow) => end(row, { scope: 'local', provisional: false, pending: null }),
    /** A refused restore changed nothing on the server; the entry stays as it was. */
    settle: (row: BinOutboxRow) => end(row, { pending: null }),
    rowKey,
  };

  function end(row: BinOutboxRow, patch: Partial<BinEntryRow['entry']>) {
    return transact<void>('readwrite', (tx, finish, abort) => {
      const entries = tx.objectStore(binEntryTable);
      getThen(entries, key(row.deletionId), (value) => {
        const saved = value as BinEntryRow | undefined;
        if (!saved) return abort();
        entries.put({ ...saved, entry: { ...saved.entry, ...patch } }, key(row.deletionId));
        tx.objectStore(binOutboxTable).delete(rowKey(row));
        finish(undefined);
      });
    });
  }
}

export type BinOutbox = ReturnType<typeof binOutbox>;
