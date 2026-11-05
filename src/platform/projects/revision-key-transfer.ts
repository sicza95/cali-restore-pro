import { importCode, newCode, open, seal } from '../vault/crypto';
import { assertID } from '../vault/file-format';
import type { LocalVault } from '../vault/vault';
import { validateProject } from './projects';
import { openRevision } from './revisions';
import type { ProjectRevisionKeyTransfer as Transfer } from '../api';
import type { Project } from './types';

const purpose = (project: string, id: string, epoch: string, syncEpoch: string) =>
  `sync:transfer:${project}:${id}:${epoch}:${syncEpoch}` as const;

export function revisionKeyTransfer(vault: LocalVault, csrf: () => string) {
  const queue = vault.revisions();

  async function request(project: string, id: string, next?: Transfer) {
    const headers = new Headers({ 'X-Sync-Account': queue.account });
    if (next) {
      const token = csrf();
      if (!token) throw new Error('Session token unavailable');
      headers.set('X-CSRF-Token', token);
      headers.set('Content-Type', 'application/json');
    }
    const response = await fetch(`/api/v1/hosted-projects/${project}/revision-key/${id}`, {
      method: next ? 'PUT' : 'GET',
      body: next ? JSON.stringify(next) : undefined,
      headers,
      cache: 'no-store',
      redirect: 'error',
      signal: queue.signal,
    });
    if (!response.ok) throw new Error('Project key transfer unavailable');
    return response;
  }

  return {
    account: queue.account,
    async create(project: string, recipient: string) {
      assertID(recipient);
      const { epoch: syncEpoch, head } = await queue.readRemote(project);
      if (!head) throw new Error('Publish a cloud copy first');
      const { epoch } = head;
      const code = await queue.projectCode(project, epoch);
      // A locally provisioned key can lose a race to publish the first head.
      await openRevision(project, head, { epoch, key: await importCode(code) });
      const id = crypto.randomUUID();
      const secret = newCode();
      const { salt, ciphertext } = await seal(
        await importCode(secret),
        recipient,
        purpose(project, id, epoch, syncEpoch),
        code,
      );
      await request(project, id, { recipient, epoch, syncEpoch, salt, ciphertext });
      queue.signal.throwIfAborted();
      return `cr1.${project}.${id}.${secret}`;
    },
    async accept(value: string) {
      const [version, project, id, secret, ...rest] = value.trim().split('.');
      if (version !== 'cr1' || rest.length || !/^[a-f0-9]{64}$/.test(secret))
        throw new Error('Invalid project transfer code');
      assertID(project);
      assertID(id);
      const { recipient, epoch, syncEpoch, salt, ciphertext } = (await (
        await request(project, id)
      ).json()) as Transfer;
      if (recipient !== queue.account) throw new Error('Wrong recipient');
      const code = await open(
        await importCode(secret),
        recipient,
        purpose(project, id, epoch, syncEpoch),
        { version: 1, salt, ciphertext },
      );
      const state = await queue.readRemote(project);
      if (state.epoch !== syncEpoch || state.head?.epoch !== epoch)
        throw new Error('The cloud epoch changed');
      const text = await openRevision(project, state.head, { epoch, key: await importCode(code) });
      const document = validateProject(JSON.parse(text) as Project, project);
      const created = await queue.acceptKey(project, state.head, code, text);
      return { project, created, document: { ...document, revision: 1 } };
    },
  };
}
