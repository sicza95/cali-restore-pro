import type { BinCatalogEntry } from '../../api';
import { aead, plaintextCode } from '../../vault/aead';
import type { BinDisplay } from '../../vault/bin-store';
import { importCode, open } from '../../vault/crypto';
import type { LocalVault } from '../../vault/vault';
import { hostedRemote } from './hosted-remote';

export type HostedCatalogItem = { remote: BinCatalogEntry; display?: BinDisplay };

export async function readHostedCatalog(
  organisation: string,
  vault: LocalVault,
  signal: AbortSignal,
): Promise<HostedCatalogItem[]> {
  const remote = await hostedRemote(signal).catalog(organisation);
  const queue = vault.revisions();
  const plaintextKey = aead.enabled ? undefined : importCode(plaintextCode);
  const checkpoints = plaintextKey ? [] : await queue.checkpoints();
  const epochs = new Map(checkpoints.map(({ project, epoch }) => [project, epoch]));
  const keys = new Map<string, Promise<CryptoKey | undefined>>();
  function projectKey(project: string) {
    const epoch = epochs.get(project);
    if (!epoch) return;
    let key = keys.get(project);
    if (!key) {
      key = queue.projectKey(project, epoch).then(
        ({ key }) => key,
        () => undefined,
      );
      keys.set(project, key);
    }
    return key;
  }
  async function displayFor(row: BinCatalogEntry) {
    if (!row.display || !row.capabilities.read.allowed) return;
    const root = await (plaintextKey ?? projectKey(row.projectId));
    if (!root) return;
    try {
      const text = await open(root, row.projectId, `bin:${row.deletionId}:display`, {
        ...row.display,
        version: 1,
      });
      const value = JSON.parse(text) as Partial<BinDisplay> | null;
      if (
        typeof value?.name === 'string' &&
        Array.isArray(value.path) &&
        value.path.every((part) => typeof part === 'string')
      )
        return { name: value.name, path: value.path };
    } catch {
      // A rotated or unavailable key leaves the catalog metadata readable.
    }
  }
  const result: HostedCatalogItem[] = [];
  for (let start = 0; start < remote.length; start += 32) {
    signal.throwIfAborted();
    result.push(
      ...(await Promise.all(
        remote.slice(start, start + 32).map(async (row) => ({
          remote: row,
          display: await displayFor(row),
        })),
      )),
    );
  }
  return result;
}
