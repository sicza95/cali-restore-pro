import { importCode, newCode, open, seal } from './crypto';
import type { Envelope } from './crypto';
import {
  accountRange,
  connect,
  projectTable,
  revisionQueueTable,
  revisionSyncTable,
  vaultTable,
} from './store';
import type { VaultRow } from './store';
import { revisionBlockFor, revisionRemote, sealRevision } from '../projects/revisions';
import type {
  RevisionBase,
  RevisionBlock,
  RevisionHead,
  RevisionKey,
  RevisionState,
  RevisionWrite,
} from '../projects/revisions';

import { assertID } from './file-format';
import type { ProjectRow } from './project-store';

export type SyncCheckpoint = {
  project: string;
  epoch: string;
  revision: number;
  localRevision: number;
};
type EditorWrite = { checkpoint: SyncCheckpoint; localRevision: number };
type ReviewLocal = { expected: number; next?: ProjectRow };
type Draft = {
  id: string;
  project: string;
  write: RevisionWrite;
  local: Envelope;
  blocked?: RevisionBlock;
  editor?: EditorWrite;
};

export function revisionQueue(
  root: CryptoKey,
  account: string,
  stamp: () => string,
  signal: AbortSignal,
) {
  const remote = revisionRemote(account, signal);
  async function transaction<T>(
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
        const abort = () => tx.abort();
        let value: T;
        signal.addEventListener('abort', abort, { once: true });
        tx.onabort = () => {
          signal.removeEventListener('abort', abort);
          reject(signal.reason ?? tx.error ?? new Error('Vault changed'));
        };
        tx.oncomplete = () => {
          signal.removeEventListener('abort', abort);
          if (signal.aborted) reject(signal.reason);
          else resolve(value);
        };
        const vault = tx.objectStore(vaultTable).get(account);
        vault.onsuccess = () => {
          if ((vault.result as VaultRow | undefined)?.stamp !== stamp()) abort();
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
  }

  const rows = () =>
    transaction<Draft[]>('readonly', (store, result) => {
      const request = store.getAll(accountRange(account));
      request.onsuccess = () => result(request.result as Draft[]);
    });

  function replace(
    project: string,
    previous: string | undefined,
    next?: Draft,
    review = false,
    ack?: RevisionState,
    reviewedLocal?: ReviewLocal,
  ) {
    return transaction<boolean>('readwrite', (store, result, sync) => {
      const key = [account, project];
      const request = store.get(key);
      request.onsuccess = () => {
        const current = request.result as Draft | undefined;
        if (current?.id !== previous || (review && !current?.blocked)) {
          result(false);
          return;
        }
        const commit = () => {
          if (next) store.put(next, key);
          else store.delete(key);
          if (ack?.head && current?.editor) {
            sync.put(
              {
                project,
                epoch: ack.epoch,
                revision: ack.head.revision,
                localRevision: current.editor.localRevision,
              } satisfies SyncCheckpoint,
              key,
            );
          }
          result(true);
        };
        const commitReviewed = () => {
          if (!reviewedLocal) return commit();
          const projects = store.transaction.objectStore(projectTable);
          const document = projects.get(key);
          document.onsuccess = () => {
            if ((document.result as ProjectRow | undefined)?.revision !== reviewedLocal.expected) {
              result(false);
              return;
            }
            if (reviewedLocal.next) projects.put(reviewedLocal.next, key);
            commit();
          };
        };
        if (next?.editor && !next.blocked) {
          const check = sync.get(key);
          check.onsuccess = () => {
            const saved = check.result as SyncCheckpoint | undefined;
            const base = next.editor!.checkpoint;
            if (
              saved?.revision === base.revision &&
              saved.epoch === base.epoch &&
              saved.localRevision === base.localRevision
            )
              commitReviewed();
            else result(false);
          };
        } else commit();
      };
    });
  }

  async function stage(
    project: string,
    state: RevisionBase,
    key: RevisionKey,
    text: string,
    reviewed?: string,
    editor?: EditorWrite,
    reviewedLocal?: ReviewLocal,
  ) {
    const id = crypto.randomUUID();
    const write = await sealRevision(project, state, key, text);
    const local = await seal(root, account, `sync:draft:${project}:${id}`, text);
    if (
      !(await replace(
        project,
        reviewed,
        { id, project, write, local, editor },
        reviewed !== undefined,
        undefined,
        reviewedLocal,
      ))
    )
      throw new Error('A queued edit changed; reload it before replacing it');
    const wake = () => schedule?.(0);
    if (running) void running.then(wake, wake);
    else wake();
    return id;
  }

  let running: Promise<boolean> | undefined;
  let schedule: ((delay: number) => void) | undefined;
  async function drain(csrf: string) {
    let retry = false;
    for (const draft of await rows()) {
      if (draft.blocked) continue;
      try {
        const ack = await remote.write(draft.project, draft.write, csrf);
        await replace(draft.project, draft.id, undefined, false, ack);
      } catch (error) {
        signal.throwIfAborted();
        const blocked = revisionBlockFor(error);
        if (blocked) await replace(draft.project, draft.id, { ...draft, blocked });
        else retry = true;
        continue;
      }
    }
    return retry;
  }

  const retry = (csrf: string) => (running ??= drain(csrf).finally(() => (running = undefined)));

  function start(getCsrf: () => Promise<string>, onError: (error: unknown) => void) {
    signal.throwIfAborted();
    if (schedule) throw new Error('Retry runner is already active');
    let timer: ReturnType<typeof setTimeout>;
    let delay = 1000;
    let stopped = false;
    const wake = () => schedule?.(0);
    const stop = () => {
      stopped = true;
      clearTimeout(timer);
      window.removeEventListener('online', wake);
      signal.removeEventListener('abort', stop);
      schedule = undefined;
    };
    async function run() {
      try {
        if (stopped || !navigator.onLine) return;
        if (!(await rows()).some((draft) => !draft.blocked)) return;
        const csrf = await getCsrf();
        if (stopped) return;
        if (await retry(csrf)) {
          if (!stopped) schedule?.(delay);
          delay = Math.min(delay * 2, 60_000);
        } else {
          delay = 1000;
        }
      } catch (error) {
        if (!stopped) {
          onError(error);
          if (!stopped) schedule?.(delay);
          delay = Math.min(delay * 2, 60_000);
        }
      }
    }
    schedule = (ms) => {
      clearTimeout(timer);
      timer = setTimeout(() => void run(), ms);
    };
    window.addEventListener('online', wake);
    signal.addEventListener('abort', stop, { once: true });
    wake();
    return () => {
      if (!stopped) stop();
    };
  }

  async function projectCode(project: string, epoch: string, provision = false) {
    assertID(project);
    assertID(epoch);
    const purpose = `sync:key:${project}:${epoch}` as const;
    const candidate = provision ? await seal(root, account, purpose, newCode()) : undefined;
    const envelope = await transaction<Envelope | undefined>(
      candidate ? 'readwrite' : 'readonly',
      (_store, result, sync) => {
        const key = [account, project, epoch];
        const request = sync.get(key);
        request.onsuccess = () => {
          if (!request.result && candidate) sync.add(candidate, key);
          result((request.result as Envelope | undefined) ?? candidate);
        };
      },
    );
    if (!envelope) throw new Error('Project key unavailable on this device');
    const code = await open(root, account, purpose, envelope);
    signal.throwIfAborted();
    return code;
  }

  return {
    start,
    account,
    signal,
    projectCode,
    projectKey: async (project: string, epoch: string, provision = false) => ({
      epoch,
      key: await importCode(await projectCode(project, epoch, provision)),
    }),
    async acceptKey(project: string, head: RevisionHead, code: string, text: string) {
      const key = [account, project];
      const [epochKey, envelope] = await Promise.all([
        seal(root, account, `sync:key:${project}:${head.epoch}`, code),
        seal(root, account, `project:${project}:1`, text),
      ]);
      return transaction<boolean>('readwrite', (store, result, sync) => {
        const projects = store.transaction.objectStore(projectTable);
        const document = projects.getKey(key);
        document.onsuccess = () => {
          if (!document.result) {
            projects.add({ id: project, revision: 1, envelope } satisfies ProjectRow, key);
            sync.add(
              { project, epoch: head.epoch, revision: head.revision, localRevision: 1 },
              key,
            );
          }
          sync.put(epochKey, [...key, head.epoch]);
          result(!document.result);
        };
      });
    },
    checkpoints: () =>
      transaction<SyncCheckpoint[]>('readonly', (_store, result, sync) => {
        const request = sync.getAll(accountRange(account));
        request.onsuccess = () =>
          result(
            (request.result as (SyncCheckpoint | Envelope)[]).filter(
              (row): row is SyncCheckpoint => 'project' in row,
            ),
          );
      }),
    enableEditor: (project: string, epoch: string) =>
      transaction<void>('readwrite', (_store, result, sync) => {
        sync.add({ project, epoch, revision: 0, localRevision: 0 } satisfies SyncCheckpoint, [
          account,
          project,
        ]);
        result(undefined);
      }),
    stageEditor: (base: SyncCheckpoint, localRevision: number, key: RevisionKey, text: string) =>
      stage(
        base.project,
        { epoch: base.epoch, head: base.revision ? { revision: base.revision } : null },
        key,
        text,
        undefined,
        { checkpoint: base, localRevision },
      ),
    async resolveEditor(
      base: SyncCheckpoint,
      review: { id: string; state: RevisionState },
      key: RevisionKey,
      text: string,
      expected: number,
      replaceLocal: boolean,
    ) {
      const revision = expected + Number(replaceLocal);
      const next = replaceLocal
        ? {
            id: base.project,
            revision,
            envelope: await seal(root, account, `project:${base.project}:${revision}`, text),
          }
        : undefined;
      await stage(
        base.project,
        review.state,
        key,
        text,
        review.id,
        { checkpoint: base, localRevision: revision },
        { expected, next },
      );
    },
    stage: (project: string, state: RevisionState, key: RevisionKey, text: string) =>
      stage(project, state, key, text),
    readRemote: async (project: string) => {
      await rows();
      return remote.read(project);
    },
    async drafts() {
      return (await rows()).map(({ id, project, write, blocked }) => ({
        id,
        project,
        expected: write.expected,
        epoch: write.epoch,
        blocked,
      }));
    },
    async review(project: string) {
      const draft = (await rows()).find((row) => row.project === project);
      if (!draft?.blocked) return;
      const { id, blocked, local } = draft;
      const text = await open(root, account, `sync:draft:${project}:${id}`, local);
      signal.throwIfAborted();
      return { id, blocked, text };
    },
    resolve: (
      project: string,
      reviewed: string,
      state: RevisionState,
      key: RevisionKey,
      text: string,
    ) => stage(project, state, key, text, reviewed),
    discard: (project: string, reviewed: string) => replace(project, reviewed, undefined, true),
    retry,
  };
}
