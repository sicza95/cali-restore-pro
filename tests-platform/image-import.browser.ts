import { expect, test } from '@playwright/test';
import { cr2, cr3, dng, heic, orientedJpeg, rotatedHeic, tiff } from './fixtures/images';

test('worker import validates families, orientation and sRGB pixels', async ({ page }) => {
  await page.route('**/m12-test-shell', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Image tests</title>' }),
  );
  await page.goto('/m12-test-shell');
  const result = await page.evaluate(
    async (inputs) => {
      const module = '/src/platform/images/build.ts';
      const { buildWorkingImage } = (await import(
        module
      )) as typeof import('../src/platform/images/build');
      const canvas = new OffscreenCanvas(30, 40);
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#3050a0';
      ctx.fillRect(0, 0, 30, 40);
      ctx.clearRect(0, 0, 10, 10);
      const png = await canvas.convertToBlob();
      const webp = await canvas.convertToBlob({ type: 'image/webp' });
      const oversized = new Uint8Array(await png.arrayBuffer());
      new DataView(oversized.buffer).setUint32(16, 20_000);
      const payloads = [
        ...inputs.map((bytes) => new Blob([new Uint8Array(bytes)])),
        png,
        webp,
        new Blob([oversized]),
        png.slice(0, png.size - 8),
        new Blob(['unsupported bytes']),
      ];
      const values = [];
      for (const blob of payloads) {
        try {
          const { manifest, parts } = await buildWorkingImage(blob, new AbortController().signal);
          const bitmap = await createImageBitmap(parts[0]!);
          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
          ctx.drawImage(bitmap, 0, 0);
          const { data } = ctx.getImageData(
            Math.min(5, bitmap.width - 3),
            Math.min(5, bitmap.height - 2),
            1,
            1,
          );
          values.push({ ...manifest, color: Array.from(data), parts: parts.length });
          bitmap.close();
        } catch (error) {
          values.push(String(error));
        }
      }
      return values;
    },
    [orientedJpeg, tiff, dng, cr2, cr3, heic, rotatedHeic].map((file) => [...file]),
  );
  expect(result).toEqual([
    expect.objectContaining({
      format: 'jpeg',
      embeddedPreview: false,
      pixels: { width: 48, height: 64 },
      parts: 1,
    }),
    expect.objectContaining({
      format: 'tiff',
      embeddedPreview: false,
      pixels: { width: 3, height: 2 },
      color: [150, 150, 150, 255],
    }),
    ...['dng', 'cr2', 'cr3'].map((format) =>
      expect.objectContaining({
        format,
        embeddedPreview: true,
        pixels: { width: 48, height: 64 },
        parts: 1,
      }),
    ),
    expect.objectContaining({
      format: 'heif',
      embeddedPreview: false,
      pixels: { width: 64, height: 48 },
      color: [126, 69, 50, 255],
    }),
    expect.objectContaining({ format: 'heif', pixels: { width: 48, height: 64 } }),
    expect.objectContaining({
      format: 'png',
      pixels: { width: 30, height: 40 },
      color: [0, 0, 0, 0],
    }),
    expect.objectContaining({
      format: 'webp',
      pixels: { width: 30, height: 40 },
      color: [0, 0, 0, 0],
    }),
    'Error: limit',
    'Error: invalid',
    'Error: unsupported',
  ]);
  for (const i of [0, 2, 3, 4]) {
    const pixel = result[i];
    if (typeof pixel === 'string') throw new Error(pixel);
    expect(pixel!.color[2]).toBeGreaterThan(120);
    expect(pixel!.color[0]).toBeLessThan(35);
  }
});

test('8K import persists authenticated tiles, recovers from corruption and cancels before publication', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.route('**/m12-test-shell', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Image tests</title>' }),
  );
  await page.goto('/m12-test-shell');
  const result = await page.evaluate(async () => {
    const filesModule = '/src/platform/vault/vault.ts';
    const projectModule = '/src/platform/projects/projects.ts';
    const storeModule = '/src/platform/vault/store.ts';
    const imageModule = '/src/platform/images/build.ts';
    const { LocalVault } = (await import(
      filesModule
    )) as typeof import('../src/platform/vault/vault');
    const { localProjects, newProject } = (await import(
      projectModule
    )) as typeof import('../src/platform/projects/projects');
    const { connect, fileTable } = (await import(
      storeModule
    )) as typeof import('../src/platform/vault/store');
    const { buildWorkingImage } = (await import(
      imageModule
    )) as typeof import('../src/platform/images/build');

    const account = 'm12-assets';
    const vault = new LocalVault(account, () => undefined);
    await vault.create('ab'.repeat(32), true);
    const projects = localProjects(vault);
    const project = await projects.save(newProject('Synthetic chapel', 'Wall', 'Plaster', 'EUR'));
    const files = vault.files();
    const canvas = new OffscreenCanvas(8192, 4096);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#23376a';
    ctx.fillRect(0, 0, 8192, 4096);
    ctx.fillStyle = '#904e28';
    ctx.fillRect(4096, 0, 4096, 4096);
    const file = new File([await canvas.convertToBlob()], 'private-8k.png');
    canvas.width = canvas.height = 1;
    const signal = new AbortController().signal;
    let id = '';
    let saved = project;
    const attach = async (ref: { id: string }, signal: AbortSignal) => {
      id = ref.id;
      const next = structuredClone(project);
      next.objects[0]!.surfaces[0]!.images.push({ id, role: 'mapping' });
      saved = await projects.save(next, { id, signal });
    };
    await files.importImage(project.id, file, attach, { signal, progress: () => undefined });

    vault.lock();
    await vault.unlock();
    const current = vault.files();
    const ref = { id, project: project.id };
    const first = await current.workingImage(ref);
    const tile = await createImageBitmap(await first.tile(0, 7, 3));
    ctx.drawImage(tile, 0, 0);
    const tileColor = Array.from(ctx.getImageData(0, 0, 1, 1).data);
    tile.close();
    let invalidTile = false;
    try {
      await first.tile(0, 8, 0);
    } catch (error) {
      invalidTile = error instanceof RangeError;
    }
    const decrypted: Uint8Array<ArrayBuffer>[] = [];
    for await (const bytes of current.original(ref)) decrypted.push(bytes);
    const digest = async (blob: Blob) =>
      Array.from(
        new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())),
      ).join(',');
    const identical = (await digest(new Blob(decrypted))) === (await digest(file));

    const db = await connect();
    const keys = () =>
      new Promise<IDBValidKey[]>((resolve) => {
        const request = db.transaction(fileTable).objectStore(fileTable).getAllKeys();
        request.onsuccess = () => resolve(request.result);
      });
    const initial = (await keys()).length;
    const cacheRecord = [account, id, -2];
    const tampered = await new Promise<boolean>((resolve, reject) => {
      const tx = db.transaction(fileTable, 'readwrite');
      tx.onabort = () => reject(tx.error);
      const table = tx.objectStore(fileTable);
      const read = table.get(cacheRecord);
      let encrypted = false;
      read.onsuccess = () => {
        const bytes = new Uint8Array(read.result as ArrayBuffer);
        encrypted = new DataView(bytes.buffer).getUint32(0) !== 0x89504e47;
        bytes[bytes.length - 1] ^= 1;
        table.put(bytes.buffer, cacheRecord);
      };
      tx.oncomplete = () => resolve(encrypted);
    });
    const restored = await current.workingImage(ref);
    const regenerated = (await digest(restored.proxy)) === (await digest(first.proxy));

    const small = new File([restored.proxy], 'small.png');
    let decoderCancelled = false;
    const decodeController = new AbortController();
    const pending = buildWorkingImage(file, decodeController.signal).catch((error: Error) => {
      decoderCancelled = error.name === 'AbortError';
    });
    decodeController.abort();
    await pending;
    const stageController = new AbortController();
    let stagingCancelled = false;
    await current
      .importImage(project.id, small, attach, {
        signal: stageController.signal,
        progress: (value) => {
          if (value >= 0.9) stageController.abort();
        },
      })
      .catch((error: Error) => {
        stagingCancelled = error.name === 'AbortError';
      });
    const commitController = new AbortController();
    let commitCancelled = false;
    await current
      .importImage(
        project.id,
        small,
        async (pending, operation) => {
          const next = structuredClone(saved);
          next.objects[0]!.surfaces[0]!.images.push({ id: pending.id, role: 'reference' });
          commitController.abort();
          await projects.save(next, { id: pending.id, signal: operation });
        },
        { signal: commitController.signal, progress: () => undefined },
      )
      .catch((error: Error) => {
        commitCancelled = error.name === 'AbortError';
      });
    const afterCancels = (await keys()).length;
    const actualRevision = (await projects.list())[0]?.revision;
    vault.lock();
    const lockDenied = await first.tile(0, 0, 0).then(
      () => false,
      () => true,
    );
    await vault.unlock();
    await vault.files().removeLocal(ref);
    const remaining = (await keys()).length;
    db.close();
    vault.close();
    return {
      manifest: first.manifest,
      tileColor,
      invalidTile,
      identical,
      tampered,
      regenerated,
      decoderCancelled,
      stagingCancelled,
      commitCancelled,
      afterCancels,
      initial,
      actualRevision,
      lockDenied,
      remaining,
    };
  });
  expect(result).toMatchObject({
    manifest: {
      pixels: { width: 8192, height: 4096 },
      proxy: { width: 1536, height: 768 },
      levels: [
        { width: 4096, height: 2048 },
        { width: 2048, height: 1024 },
        { width: 1024, height: 512 },
      ],
    },
    tileColor: [144, 78, 40, 255],
    invalidTile: true,
    identical: true,
    tampered: true,
    regenerated: true,
    decoderCancelled: true,
    stagingCancelled: true,
    commitCancelled: true,
    actualRevision: 2,
    lockDenied: true,
    remaining: 0,
  });
  expect(result.initial).toBeGreaterThan(44);
  expect(result.afterCancels).toBe(result.initial);
});
