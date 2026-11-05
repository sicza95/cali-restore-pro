import { expect, test } from '@playwright/test';

test('encrypted originals survive reload, reject tampering, and disappear on vault forget', async ({
  page,
}) => {
  const project = 'b1000000-0000-4000-8000-000000000000';
  const account = 'a1000000-0000-4000-8000-000000000000';
  const name = 'synthetic-original.DNG';
  const size = 3 * 1024 * 1024 + 17;
  await page.goto('/');
  const ref = await page.evaluate(
    async ({ project, account, name, size }) => {
      const module = '/src/platform/vault/vault.ts';
      const { LocalVault } = (await import(module)) as typeof import('../src/platform/vault/vault');
      const vault = new LocalVault(account, () => undefined);
      await vault.create('aa'.repeat(32), true);
      const bytes = Uint8Array.from(
        { length: size },
        (_, i) => (i + Math.floor(i / (1 << 20))) % 251,
      );
      const source = new File([bytes], name, { type: 'image/x-adobe-dng' });
      const files = vault.files();
      const abort = new AbortController();
      const cancelled = files.stage(project, source, {
        signal: abort.signal,
        progress: () => abort.abort(),
      });
      if (
        !(await cancelled.then(
          () => false,
          (error: DOMException) => error.name === 'AbortError',
        ))
      )
        throw new Error('Expected cancellation');
      const ref = await files.stage(project, source);
      vault.lock();
      if (
        !(await files.metadata(ref).then(
          () => false,
          () => true,
        ))
      )
        throw new Error('Locked handle read content');
      vault.close();
      return ref;
    },
    { project, account, name, size },
  );
  await page.reload();

  const result = await page.evaluate(
    async ({ account, name, ref, size }) => {
      const vaultModule = '/src/platform/vault/vault.ts';
      const storeModule = '/src/platform/vault/store.ts';
      const { LocalVault } = (await import(
        vaultModule
      )) as typeof import('../src/platform/vault/vault');
      const { connect, fileTable } = (await import(
        storeModule
      )) as typeof import('../src/platform/vault/store');
      const vault = new LocalVault(account, () => undefined);
      await vault.unlock();
      const files = vault.files();
      const metadata = await files.metadata(ref);
      let offset = 0;
      for await (const bytes of files.original(ref)) {
        for (const byte of bytes) {
          if (byte !== (offset + Math.floor(offset / (1 << 20))) % 251)
            throw new Error('Original changed');
          offset++;
        }
      }

      const db = await connect();
      const transaction = async <T>(
        mode: IDBTransactionMode,
        action: (s: IDBObjectStore) => IDBRequest<T>,
      ) =>
        new Promise<T>((resolve, reject) => {
          const tx = db.transaction(fileTable, mode);
          const result = action(tx.objectStore(fileTable));
          tx.oncomplete = () => resolve(result.result);
          tx.onabort = () => reject(tx.error);
        });
      const count = await transaction('readonly', (s) => s.count());
      const manifest = await transaction<ArrayBuffer>('readonly', (s) =>
        s.get([account, ref.id, 0]),
      );
      const hidden = !new TextDecoder().decode(manifest).includes(name);
      const first = await transaction<ArrayBuffer>('readonly', (s) => s.get([account, ref.id, 1]));
      const second = await transaction<ArrayBuffer>('readonly', (s) => s.get([account, ref.id, 2]));
      await transaction('readwrite', (s) => s.put(second, [account, ref.id, 1]));
      const rejects = async () =>
        files
          .original(ref)
          .next()
          .then(
            () => false,
            () => true,
          );
      const swapped = await rejects();
      new Uint8Array(first)[0] ^= 1;
      await transaction('readwrite', (s) => s.put(first, [account, ref.id, 1]));
      const corrupt = await rejects();
      await vault.forget(true);
      const removed = await transaction('readonly', (s) => s.count());
      db.close();
      vault.close();
      return { metadata, complete: offset === size, hidden, count, swapped, corrupt, removed };
    },
    { account, ref, name, size },
  );

  expect(result).toEqual({
    metadata: { name, type: 'image/x-adobe-dng', size },
    complete: true,
    hidden: true,
    count: 6,
    swapped: true,
    corrupt: true,
    removed: 0,
  });
});
