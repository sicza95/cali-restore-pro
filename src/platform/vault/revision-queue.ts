import { open, seal } from './crypto';
import type { Envelope } from './crypto';
import { accountRange, connect, revisionQueueTable, vaultTable } from './store';
import type { VaultRow } from './store';
import { RevisionError, revisionRemote, sealRevision } from '../projects/revisions';
import type { RevisionKey, RevisionState, RevisionWrite } from '../projects/revisions';

type Block = 'conflict' | 'epoch' | 'access' | 'rejected';
type Draft = {
  id: string;
  project: string;
  write: RevisionWrite;
  local: Envelope;
  blocked?: Block;
};

export function revisionQueue(
  root: CryptoKey,
  account: string,
  stamp: string,
  signal: AbortSignal,
) {
  const remote = revisionRemote(account, signal);
  async function transaction<T>(
    mode: IDBTransactionMode,
    run: (store: IDBObjectStore, result: (value: T) => void) => void,
  ) {
    signal.throwIfAborted();
    const db = await connect();
    try {
      signal.throwIfAborted();
      return await new Promise<T>((resolve, reject) => {
        const tx = db.transaction([vaultTable, revisionQueueTable], mode, { durability: 'strict' });
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
          if ((vault.result as VaultRow | undefined)?.stamp !== stamp) abort();
          else run(tx.objectStore(revisionQueueTable), (next) => (value = next));
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

  function replace(project: string, previous: string | undefined, next?: Draft, review = false) {
    return transaction<boolean>('readwrite', (store, result) => {
      const key = [account, project];
      const request = store.get(key);
      request.onsuccess = () => {
        const current = request.result as Draft | undefined;
        if (current?.id !== previous || (review && !current?.blocked)) {
          result(false);
          return;
        }
        if (next) store.put(next, key);
        else store.delete(key);
        result(true);
      };
    });
  }

  async function stage(
    project: string,
    state: RevisionState,
    key: RevisionKey,
    text: string,
    reviewed?: string,
  ) {
    const id = crypto.randomUUID();
    const write = await sealRevision(project, state, key, text);
    const local = await seal(root, account, `sync:draft:${project}:${id}`, text);
    if (!(await replace(project, reviewed, { id, project, write, local }, reviewed !== undefined)))
      throw new Error('A queued edit changed; reload it before replacing it');
    schedule?.(0);
    return id;
  }

  let running: Promise<boolean> | undefined;
  let schedule: ((delay: number) => void) | undefined;
  async function drain(csrf: string) {
    let retry = false;
    for (const draft of await rows()) {
      if (draft.blocked) continue;
      try {
        await remote.write(draft.project, draft.write, csrf);
      } catch (error) {
        signal.throwIfAborted();
        const blocked = blockFor(error);
        if (blocked) await replace(draft.project, draft.id, { ...draft, blocked });
        else retry = true;
        continue;
      }
      await replace(draft.project, draft.id);
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

  return {
    start,
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

function blockFor(error: unknown): Block | undefined {
  if (!(error instanceof RevisionError)) return;
  if (error.code === 'revision_conflict') return 'conflict';
  if (error.code === 'revision_epoch_changed') return 'epoch';
  if ([401, 403, 404].includes(error.status)) return 'access';
  if (error.code === 'original_rotation_pending' || error.status === 429 || error.status >= 500)
    return;
  return 'rejected';
}
