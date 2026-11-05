import { open, seal } from '../vault/crypto';
import type { Envelope } from '../vault/crypto';
import { assertID } from '../vault/file-format';

type Ciphertext = Omit<Envelope, 'version'>;
export type RevisionHead = Ciphertext & { revision: number; epoch: string };
export type RevisionState = { epoch: string; head: RevisionHead | null };
export type RevisionBase = { epoch: string; head: { revision: number } | null };
export type RevisionKey = { epoch: string; key: CryptoKey };
export type RevisionWrite = Ciphertext & { expected: number; epoch: string };

export async function sealRevision(
  project: string,
  state: RevisionBase,
  key: RevisionKey,
  text: string,
): Promise<RevisionWrite> {
  assertID(project);
  assertID(state.epoch);
  if (key.epoch !== state.epoch) throw new Error('Current project key required');
  const expected = state.head?.revision ?? 0;
  if (!Number.isInteger(expected) || expected < 0 || expected >= 2147483647)
    throw new Error('Invalid base revision');
  const { salt, ciphertext } = await seal(
    key.key,
    project,
    `sync:${key.epoch}:${expected + 1}`,
    text,
  );
  if (atob(ciphertext).length > 65552) throw new Error('Encrypted revision exceeds the sync limit');
  return { expected, epoch: key.epoch, salt, ciphertext };
}

export function openRevision(project: string, head: RevisionHead, key: RevisionKey) {
  assertID(project);
  if (key.epoch !== head.epoch) throw new Error('Revision key required');
  return open(key.key, project, `sync:${head.epoch}:${head.revision}`, { ...head, version: 1 });
}

export class RevisionError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}

export function revisionRemote(account: string, signal: AbortSignal) {
  async function request(project: string, next?: RevisionWrite, csrf?: string) {
    assertID(project);
    const headers = new Headers({ 'X-Sync-Account': account });
    if (next) {
      if (!csrf) throw new Error('CSRF token required');
      headers.set('Content-Type', 'application/json');
      headers.set('X-CSRF-Token', csrf);
    }
    const response = await fetch(`/api/v1/hosted-projects/${project}/revision`, {
      method: next ? 'PUT' : 'GET',
      body: next ? JSON.stringify(next) : undefined,
      cache: 'no-store',
      redirect: 'error',
      headers,
      signal,
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new RevisionError(response.status, body?.error ?? 'revision_request_failed');
    }
    const state = (await response.json()) as RevisionState;
    if (
      next &&
      (state.epoch !== next.epoch ||
        state.head?.epoch !== next.epoch ||
        state.head.revision !== next.expected + 1 ||
        state.head.salt !== next.salt ||
        state.head.ciphertext !== next.ciphertext)
    )
      throw new Error('Invalid revision acknowledgement');
    return state;
  }
  return { read: (project: string) => request(project), write: request };
}
