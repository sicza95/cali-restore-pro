import { IDBFactory } from 'fake-indexeddb';
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { abortOnSignal, abortTransaction } from './transaction-abort';

async function finished(mode: IDBTransactionMode = 'readwrite') {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const open = indexedDB.open('abort-test');
    open.onupgradeneeded = () => open.result.createObjectStore('rows');
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
  });
  const tx = db.transaction('rows', mode);
  tx.objectStore('rows').put(1, 'a');
  const done = new Promise<void>((resolve) => (tx.oncomplete = () => resolve()));
  return { db, tx, done };
}

describe('transaction abort guard', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
  });

  it('does not throw when aborting a transaction that already completed', async () => {
    const { db, tx, done } = await finished();
    await done;
    expect(() => tx.abort()).toThrow(DOMException);
    expect(() => abortTransaction(tx)).not.toThrow();
    db.close();
  });

  it('rethrows errors other than InvalidStateError', () => {
    const tx = {
      abort: () => {
        throw new TypeError('boom');
      },
    } as unknown as IDBTransaction;
    expect(() => abortTransaction(tx)).toThrow(TypeError);
  });

  it('ignores a signal that aborts after the transaction completed', async () => {
    const { db, tx, done } = await finished();
    const controller = new AbortController();
    const abort = vi.spyOn(tx, 'abort');
    abortOnSignal(tx, controller.signal);
    await done;
    expect(() => controller.abort()).not.toThrow();
    expect(abort).not.toHaveBeenCalled();
    db.close();
  });

  it('removes the listener when the transaction completes', async () => {
    const { db, tx, done } = await finished();
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, 'removeEventListener');
    abortOnSignal(tx, controller.signal);
    await done;
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
    db.close();
  });

  it('aborts a live transaction when the signal aborts, then removes the listener', async () => {
    const { db, tx } = await finished();
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, 'removeEventListener');
    abortOnSignal(tx, controller.signal);
    const aborted = new Promise<void>((resolve) => (tx.onabort = () => resolve()));
    controller.abort();
    await aborted;
    expect(remove).toHaveBeenCalled();
    db.close();
  });
});
