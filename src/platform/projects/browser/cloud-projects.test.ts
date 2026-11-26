import { expect, it, vi } from 'vitest';
import type { LocalVault } from '../../vault/vault';
import { cloudProjects } from '../cloud-projects';
import { newProject } from '../projects';
import { sealRevision } from '../revisions';
import { importCode } from '../../vault/crypto';
import { plaintextCode } from '../../vault/aead';

it('keeps unreadable remote entries flagged, skips local entries, and preserves readable names', async () => {
  const good = newProject('Readable', null, null, 'EUR');
  const epoch = crypto.randomUUID();
  const write = await sealRevision(
    good.id,
    { epoch, head: null },
    { epoch, key: await importCode(plaintextCode) },
    JSON.stringify(good),
  );
  const locked = new AbortController();
  const queue = {
    signal: locked.signal,
    readRemote: vi.fn(async (id: string) => {
      if (id === 'bad') throw new Error('private failure');
      return { epoch, head: { ...write, revision: 1 } };
    }),
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json([
        { id: 'local', organisation: 'org' },
        { id: 'bad', organisation: 'org' },
        { id: good.id, organisation: 'org' },
      ]),
    ),
  );
  const service = cloudProjects({ revisions: () => queue } as unknown as LocalVault);
  expect(await service.list(new Set(['local']))).toEqual([
    { id: 'bad', organisation: 'org', name: 'bad', unreadable: true },
    { id: good.id, organisation: 'org', name: 'Readable' },
  ]);
  expect(queue.readRemote).not.toHaveBeenCalledWith('local');
  locked.abort();
  await expect(service.list(new Set())).rejects.toThrow();
});
