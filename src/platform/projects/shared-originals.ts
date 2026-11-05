import type { LocalVault } from '../vault/vault';
import {
  assertID,
  assertShape,
  chunkCount,
  fileCipherWithKey,
  parseManifest,
  partBytes,
} from '../vault/file-format';
import type { FileShape } from '../vault/file-format';
import { readBounded } from '../vault/files';

export const maxSharedOriginals = 64;
export type SharedOriginal = { id: string; name: string; key: string };

async function versionedOriginalId(project: string, epoch: string, source: string) {
  if (!epoch) return source;
  const text = new TextEncoder().encode(
    ['calirestore-original-epoch-v1', project, epoch, source].join(':'),
  );
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', text), 0, 16);
  const hex = Array.from(hash, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');
}

export async function publishOriginals(
  vault: LocalVault,
  project: string,
  ids: string[],
  epoch: string,
  csrf: string,
  signal: AbortSignal,
) {
  if (ids.length > maxSharedOriginals) throw new Error('Too many shared originals');
  const files = vault.files();
  const originals: SharedOriginal[] = [];
  for (const source of ids) {
    signal.throwIfAborted();
    const ref = { project, id: source };
    const id = await versionedOriginalId(project, epoch, source);
    const { name } = await files.metadata(ref);
    const key = await files.publishOriginal(ref, id, { csrf, signal });
    try {
      signal.throwIfAborted();
      originals.push({ id, name, key: btoa(String.fromCharCode(...key)) });
    } finally {
      key.fill(0);
    }
  }
  return originals;
}

export function parseSharedOriginals(value: unknown): SharedOriginal[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > maxSharedOriginals)
    throw new Error('Invalid original list');
  const seen = new Set<string>();
  return value.map((entry: unknown) => {
    const original = entry as Partial<SharedOriginal> | null;
    if (
      typeof original?.id !== 'string' ||
      typeof original.name !== 'string' ||
      !original.name ||
      typeof original.key !== 'string' ||
      !/^[A-Za-z0-9+/]{43}=$/.test(original.key) ||
      seen.has(original.id)
    )
      throw new Error('Invalid shared original');
    assertID(original.id);
    seen.add(original.id);
    return { id: original.id, name: original.name, key: original.key };
  });
}

export async function openSharedOriginal(
  invitation: string,
  project: string,
  sender: string,
  original: SharedOriginal,
  signal: AbortSignal,
) {
  assertID(invitation);
  assertID(project);
  assertID(sender);
  assertID(original.id);
  const path = '/api/v1/invitations/' + invitation + '/files/' + original.id;
  const get = async (suffix = '') => {
    signal.throwIfAborted();
    const response = await fetch(path + suffix, { cache: 'no-store', redirect: 'error', signal });
    if (!response.ok) throw new Error('Original unavailable');
    return response;
  };
  const shape = (await (await get()).json()) as FileShape;
  assertShape(shape);
  const bytes = Uint8Array.from(atob(original.key), (character) => character.charCodeAt(0));
  const key = await crypto.subtle
    .importKey('raw', bytes, 'AES-GCM', false, ['decrypt'])
    .finally(() => bytes.fill(0));
  const cipher = fileCipherWithKey(key, sender, project, original.id);
  const part = async (index: number) =>
    cipher.open(index, await readBounded(await get('/parts/' + index), partBytes(shape, index)));
  const manifest = parseManifest(await part(0), shape);
  const chunks: ArrayBuffer[] = [];
  for (let index = 1; index <= chunkCount(shape); index++) chunks.push(await part(index));
  signal.throwIfAborted();
  return { name: manifest.name, blob: new Blob(chunks, { type: 'application/octet-stream' }) };
}
