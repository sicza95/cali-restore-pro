import type { CloudProject } from '../api';
import { plaintextCode } from '../vault/aead';
import { importCode } from '../vault/crypto';
import type { LocalVault } from '../vault/vault';
import { validateProject } from './projects';
import { openRevision } from './revisions';
import type { Project } from './types';

/**
 * Synced projects this account can open on this device without a transfer code. This works only
 * while encryption is off (aead.ts): any device of an owner can read the cloud copy.
 */
export function cloudProjects(vault: LocalVault) {
  const queue = vault.revisions();

  async function read(project: string) {
    const state = await queue.readRemote(project);
    if (!state.head) throw new Error('No cloud copy yet');
    const key = { epoch: state.head.epoch, key: await importCode(plaintextCode) };
    const text = await openRevision(project, state.head, key);
    return {
      head: state.head,
      text,
      document: validateProject(JSON.parse(text) as Project, project),
    };
  }

  return {
    account: queue.account,
    /** Cloud projects missing from this device, with their names. */
    async list(local: ReadonlySet<string>) {
      const response = await fetch('/api/v1/hosted-projects', {
        cache: 'no-store',
        redirect: 'error',
        signal: queue.signal,
      });
      if (!response.ok) throw new Error('Cloud projects unavailable');
      const rows = (await response.json()) as CloudProject[];
      const found: { id: string; name: string; organisation: string }[] = [];
      for (const { id, organisation } of rows) {
        if (local.has(id)) continue;
        try {
          found.push({ id, organisation, name: (await read(id)).document.name });
        } catch {
          queue.signal.throwIfAborted();
        }
      }
      return found;
    },
    /** Saves the cloud copy on this device and starts syncing it. */
    async open(project: string) {
      const { head, text, document } = await read(project);
      const created = await queue.acceptKey(project, head, plaintextCode, text);
      return { project, created, document: { ...document, revision: 1 } };
    },
  };
}
