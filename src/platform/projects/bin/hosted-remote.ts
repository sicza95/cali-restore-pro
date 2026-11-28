import type { BinCatalog } from '../../api';
import { assertID } from '../../vault/file-format';
import type { RevisionHead, RevisionWrite } from '../revisions';
import { BinError } from './errors';
import { binFailureCodes, type BinFailureCode } from './types';

type Ciphertext = { salt: string; ciphertext: string };

/** Wire shape of `binTrash` (server/internal/projects/bin_commands.go). Sealed parts stay opaque. */
export type HostedTrash = {
  deletionId: string;
  entityKind: 'project' | 'object' | 'surface';
  entityId: string;
  objectId: string | null;
  manifestSchema: number;
  manifestSha256: string;
  coverageMissing: string[];
  sourceRevision: number;
  logicalBytes: number;
  chunkCount: number;
  assets: string[];
  display: Ciphertext;
  manifest: Ciphertext;
};

export type HostedCommand = {
  operationId: string;
  digest: string;
  writerProtocol: number;
  intent: 'trash' | 'restore' | 'purge';
  deletionIds: string[];
  expectedVersions: Record<string, number>;
  head: RevisionWrite | null;
  trash: HostedTrash | null;
};

export type HostedOutcome = {
  versions: Record<string, number>;
  cascaded: string[];
  recoverUntil: Record<string, string>;
  head: RevisionHead | null;
};

/** A sealed chunk as staged: the base64 body and the SHA-256 of its bytes. */
export type HostedChunk = { sha256: string; body: string };

/** Transport failure (offline, 5xx, rate limit): the request may be retried unchanged. */
export class BinTransportError extends Error {
  constructor(readonly status: number) {
    super(`Bin request failed (${status})`);
    this.name = 'BinTransportError';
  }
}

const known = new Set<string>(binFailureCodes);

async function failure(response: Response) {
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  const code = body?.error;
  if (response.status === 401 || response.status === 404) return new BinError('forbidden');
  if (code && known.has(code) && response.status < 500)
    return new BinError(code as BinFailureCode, { status: response.status });
  if (response.status === 403) return new BinError('forbidden');
  if (response.status >= 400 && response.status < 500 && response.status !== 429)
    return new BinError('incomplete_recovery', { status: response.status, code });
  return new BinTransportError(response.status);
}

/** Hosted Bin endpoints. Writes carry the session CSRF token; every response is no-store. */
export function hostedRemote(signal: AbortSignal) {
  async function send(path: string, write?: { method: string; csrf: string; body: unknown }) {
    let response: Response;
    try {
      response = await fetch(path, {
        method: write?.method ?? 'GET',
        body: write && JSON.stringify(write.body),
        cache: 'no-store',
        redirect: 'error',
        headers: write && { 'Content-Type': 'application/json', 'X-CSRF-Token': write.csrf },
        signal,
      });
    } catch (error) {
      signal.throwIfAborted();
      throw Object.assign(new BinTransportError(0), { cause: error });
    }
    if (!response.ok) throw await failure(response);
    return response;
  }
  return {
    async catalog(organisation: string) {
      assertID(organisation);
      const entries: BinCatalog['entries'] = [];
      const cursors = new Set<string>();
      let before: string | null = null;
      do {
        const query = before ? `?before=${encodeURIComponent(before)}` : '';
        const response = await send(`/api/v1/organisations/${organisation}/bin${query}`);
        const page = (await response.json()) as BinCatalog;
        entries.push(...page.entries);
        before = page.next;
        if (before && cursors.has(before)) throw new Error('Repeated Bin catalog cursor');
        if (before) cursors.add(before);
      } while (before);
      return entries;
    },
    /** Staging is idempotent until commit; a committed chunk answers `not_retained`. */
    async stage(
      project: string,
      deletion: string,
      index: number,
      chunk: HostedChunk,
      csrf: string,
    ) {
      assertID(project);
      assertID(deletion);
      await send(`/api/v1/hosted-projects/${project}/bin/staging/${deletion}/${index}`, {
        method: 'PUT',
        csrf,
        body: chunk,
      });
    },
    /** An identical retry of a committed operation returns its stored receipt. */
    async execute(project: string, command: HostedCommand, csrf: string) {
      assertID(project);
      const response = await send(`/api/v1/hosted-projects/${project}/bin/operations`, {
        method: 'POST',
        csrf,
        body: command,
      });
      return (await response.json()) as HostedOutcome;
    },
  };
}

export type HostedRemote = ReturnType<typeof hostedRemote>;
