import { connect, fileTable, vaultTable } from './store';
import type { VaultRow } from './store';
import type { FileShape } from './file-format';
import { imageHeaderPart, imagePart } from './image-cache';
import type { Envelope } from './crypto';

export type LocalFile = FileShape & {
  project: string;
  ready: boolean;
  started: number;
  pin?: Envelope;
};

export function localFiles(account: string, stamp: string) {
  async function run<T>(
    mode: IDBTransactionMode,
    action: (store: IDBObjectStore, result: (value: T) => void, abort: () => void) => void,
  ) {
    const db = await connect();
    try {
      return await new Promise<T>((resolve, reject) => {
        const tx = db.transaction([fileTable, vaultTable], mode, { durability: 'strict' });
        let result: T;
        tx.oncomplete = () => resolve(result);
        tx.onabort = () => reject(tx.error ?? new Error('Vault or staging state changed'));
        const request = tx.objectStore(vaultTable).get(account);
        request.onsuccess = () => {
          if ((request.result as VaultRow | undefined)?.stamp !== stamp) {
            tx.abort();
            return;
          }
          action(
            tx.objectStore(fileTable),
            (value) => {
              result = value;
            },
            () => tx.abort(),
          );
        };
      });
    } finally {
      db.close();
    }
  }

  return {
    pins: () =>
      run<{ id: string; pin: Envelope }[]>('readonly', (s, result) => {
        const rows: { id: string; pin: Envelope }[] = [];
        const r = s.openCursor(
          IDBKeyRange.bound([account, 'pin:'], [account, 'pin;'], false, true),
        );
        r.onsuccess = () => {
          const cursor = r.result;
          if (!cursor) return result(rows);
          const [, id, part] = cursor.key as [string, string, number?];
          if (part === undefined) {
            const header = cursor.value as LocalFile;
            if (header.ready && header.pin) rows.push({ id, pin: header.pin });
          }
          cursor.continue([account, id, []]);
        };
      }),
    header: (id: string) =>
      run<LocalFile | undefined>('readonly', (s, result) => {
        const r = s.get([account, id]);
        r.onsuccess = () => result(r.result as LocalFile | undefined);
      }),
    start: (id: string, header: LocalFile) =>
      run<void>('readwrite', (s) => {
        s.add(header, [account, id]);
      }),
    write: (id: string, part: number, bytes: ArrayBuffer) =>
      run<void>('readwrite', (s, _, abort) => {
        const r = s.get([account, id]);
        r.onsuccess = () => {
          if (!r.result || (r.result as LocalFile).ready) abort();
          else s.add(bytes, [account, id, part]);
        };
      }),
    read: (id: string, part: number) =>
      run<ArrayBuffer | undefined>('readonly', (s, result) => {
        const r = s.get([account, id, part]);
        r.onsuccess = () => result(r.result as ArrayBuffer | undefined);
      }),
    finish: (id: string) =>
      run<void>('readwrite', (s, _, abort) => {
        const r = s.get([account, id]);
        r.onsuccess = () => {
          const header = r.result as LocalFile | undefined;
          if (!header || header.ready) abort();
          else s.put({ ...header, ready: true }, [account, id]);
        };
      }),
    writeImage: (id: string, project: string, parts: ArrayBuffer[], signal: AbortSignal) =>
      run<void>('readwrite', (s, _, abort) => {
        const r = s.get([account, id]);
        const transaction = s.transaction;
        const cancel = () => {
          try {
            abort();
          } catch (error) {
            if (!(error instanceof DOMException) || error.name !== 'InvalidStateError') throw error;
          }
        };
        if (signal.aborted) return abort();
        signal.addEventListener('abort', cancel, { once: true });
        const release = () => signal.removeEventListener('abort', cancel);
        transaction.addEventListener('complete', release, { once: true });
        transaction.addEventListener('abort', release, { once: true });
        r.onsuccess = () => {
          const header = r.result as LocalFile | undefined;
          if (header?.project !== project) return abort();
          s.delete(IDBKeyRange.bound([account, id, -Infinity], [account, id, imageHeaderPart]));
          for (let i = 0; i < parts.length; i++) {
            s.put(parts[i], [account, id, i === 0 ? imageHeaderPart : imagePart(i - 1)]);
          }
        };
      }),
    remove: (id: string) =>
      run<void>('readwrite', (s) => {
        s.delete(IDBKeyRange.bound([account, id], [account, id, Infinity]));
      }),
    cleanup: () =>
      run<void>('readwrite', (s) => {
        const expired = Date.now() - 24 * 60 * 60 * 1000;
        const r = s.openKeyCursor(IDBKeyRange.bound([account], [account, []]));
        r.onsuccess = () => {
          const cursor = r.result;
          if (!cursor) return;
          const [, id, part] = cursor.key as [string, string, number?];
          if (part !== undefined) {
            cursor.continue();
            return;
          }
          const header = s.get(cursor.key);
          header.onsuccess = () => {
            const record = header.result as LocalFile;
            if (!record.ready && record.started < expired)
              s.delete(IDBKeyRange.bound([account, id], [account, id, Infinity]));
            cursor.continue([account, id, []]);
          };
        };
      }),
  };
}
