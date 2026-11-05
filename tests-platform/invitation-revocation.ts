import { createHash, randomUUID } from 'node:crypto';
import { expect } from '@playwright/test';
import type { APIRequestContext, Page } from '@playwright/test';

export async function pauseOriginalDownload(inbox: Page, original: string) {
  let resume!: () => void;
  const paused = new Promise<void>((resolve) => (resume = resolve));
  let status!: (code: number) => void;
  const response = new Promise<number>((resolve) => (status = resolve));
  const downloads: string[] = [];
  inbox.on('download', (download) => downloads.push(download.suggestedFilename()));
  await inbox.route(
    '**' + original + '/parts/1',
    async (route) => {
      await paused;
      const result = await route.fetch();
      await route.fulfill({ response: result });
      status(result.status());
    },
    { times: 1 },
  );
  const nextPart = inbox.waitForRequest((request) => request.url().endsWith(original + '/parts/1'));
  await inbox.getByRole('button', { name: 'Download original' }).click();
  // The client has already decrypted the manifest and is waiting for the data.
  await nextPart;
  return async () => {
    resume();
    expect(await response).toBe(404);
    await expect(
      inbox.getByRole('region', { name: 'Shared originals' }).getByRole('alert'),
    ).toBeVisible();
    expect(downloads).toEqual([]);
  };
}

export async function stageOriginalUpload(
  owner: APIRequestContext,
  project: string,
  origin: string,
) {
  const { csrfToken } = await (await owner.get('/api/v1/auth/me')).json();
  const headers = { Origin: origin, 'X-CSRF-Token': csrfToken };
  const path = '/api/v1/hosted-projects/' + project + '/files/' + randomUUID();
  const reservation = await owner.put(path, {
    headers,
    data: { sourceBytes: 1, manifestBytes: 17 },
  });
  expect(reservation.status()).toBe(200);
  const putPart = async (part: number) => {
    const data = Buffer.alloc(17, part);
    return owner.put(path + '/parts/' + part, {
      data,
      headers: {
        ...headers,
        'Content-Type': 'application/octet-stream',
        'X-Ciphertext-SHA256': createHash('sha256').update(data).digest('hex'),
      },
    });
  };
  expect((await putPart(0)).status()).toBe(204);
  return {
    finishParts: () => putPart(1),
    commit: () => owner.post(path + '/commit', { headers, data: {} }),
    read: () => owner.get(path),
  };
}

export async function verifyPublicationPaused(
  owner: APIRequestContext,
  project: string,
  origin: string,
  stale: Awaited<ReturnType<typeof stageOriginalUpload>>,
) {
  expect((await stale.finishParts()).status()).toBe(409);
  expect((await stale.commit()).status()).toBe(409);
  const fresh = await stageOriginalUpload(owner, project, origin);
  expect((await fresh.finishParts()).status()).toBe(204);
  const blocked = await fresh.commit();
  expect(blocked.status()).toBe(409);
  expect(await blocked.json()).toEqual({ error: 'original_rotation_pending' });
  expect((await fresh.read()).status()).toBe(404);
  return async () => {
    expect((await fresh.commit()).status()).toBe(204);
    expect((await fresh.read()).status()).toBe(200);
    expect((await stale.commit()).status()).toBe(409);
  };
}
