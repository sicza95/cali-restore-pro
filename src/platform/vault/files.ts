import {
  assertID,
  assertShape,
  chunkBytes,
  chunkCount,
  fileCipher,
  originalKey,
  parseManifest,
  partBytes,
  sourceManifest,
} from './file-format';
import type { FileShape } from './file-format';
import { localFiles } from './file-store';

type Ref = { project: string; id: string };
type Options = { signal?: AbortSignal; progress?: (completed: number, total: number) => void };
type RemoteOptions = Options & { csrf: string };

export class TransferError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}

export function encryptedFiles(
  root: CryptoKey,
  account: string,
  stamp: string,
  locked: AbortSignal,
) {
  const local = localFiles(account, stamp);
  const signalFor = (options: Options) =>
    options.signal ? AbortSignal.any([locked, options.signal]) : locked;
  const cipher = ({ project, id }: Ref) => fileCipher(root, account, project, id);
  const projectPath = (project: string) => {
    assertID(project);
    return '/api/v1/hosted-projects/' + project;
  };
  const filePath = ({ project, id }: Ref) => {
    assertID(id);
    return projectPath(project) + '/files/' + id;
  };

  async function request(
    path: string,
    signal: AbortSignal,
    method = 'GET',
    csrf?: string,
    body?: string | ArrayBuffer,
  ) {
    signal.throwIfAborted();
    const headers = new Headers();
    if (csrf !== undefined) headers.set('X-CSRF-Token', csrf);
    if (typeof body === 'string') headers.set('Content-Type', 'application/json');
    if (body instanceof ArrayBuffer) {
      headers.set('Content-Type', 'application/octet-stream');
      headers.set(
        'X-Ciphertext-SHA256',
        Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', body)), (byte) =>
          byte.toString(16).padStart(2, '0'),
        ).join(''),
      );
    }
    const response = await fetch(path, {
      method,
      headers,
      body,
      signal,
      cache: 'no-store',
      redirect: 'error',
    });
    if (!response.ok) {
      const value = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new TransferError(response.status, value?.error ?? 'transfer_failed');
    }
    return response;
  }

  async function ready({ project, id }: Ref) {
    assertID(project);
    assertID(id);
    locked.throwIfAborted();
    const record = await local.header(id);
    locked.throwIfAborted();
    if (!record?.ready || record.project !== project) throw new Error('Local file unavailable');
    return record;
  }

  async function readPart(id: string, shape: FileShape, part: number) {
    const bytes = await local.read(id, part);
    if (!bytes || bytes.byteLength !== partBytes(shape, part))
      throw new Error('Local file incomplete');
    return bytes;
  }

  async function persist(
    ref: Ref,
    shape: FileShape,
    options: Options,
    getPart: (part: number, signal: AbortSignal) => Promise<ArrayBuffer>,
  ) {
    const signal = signalFor(options);
    signal.throwIfAborted();
    await local.cleanup();
    signal.throwIfAborted();
    await local.start(ref.id, {
      ...shape,
      project: ref.project,
      ready: false,
      started: Date.now(),
    });
    try {
      for (let part = 0; part <= chunkCount(shape); part++) {
        signal.throwIfAborted();
        const bytes = await getPart(part, signal);
        signal.throwIfAborted();
        await local.write(ref.id, part, bytes);
        if (part > 0)
          options.progress?.(Math.min(part * chunkBytes, shape.sourceBytes), shape.sourceBytes);
      }
      signal.throwIfAborted();
      await local.finish(ref.id);
      return ref;
    } catch (error) {
      await local.remove(ref.id).catch(() => undefined);
      throw error;
    }
  }

  async function uploadParts(
    ref: Ref,
    shape: FileShape,
    options: RemoteOptions,
    read: (part: number) => Promise<ArrayBuffer>,
  ) {
    const path = filePath(ref);
    const signal = signalFor(options);
    const reservation = await request(path, signal, 'PUT', options.csrf, JSON.stringify(shape));
    const state = ((await reservation.json()) as { state: string }).state;
    if (state === 'committed') return;
    if (state !== 'staged') throw new Error('Unexpected transfer state');
    for (let part = 0; part <= chunkCount(shape); part++) {
      signal.throwIfAborted();
      await request(path + '/parts/' + part, signal, 'PUT', options.csrf, await read(part));
      if (part > 0)
        options.progress?.(Math.min(part * chunkBytes, shape.sourceBytes), shape.sourceBytes);
    }
    await request(path + '/commit', signal, 'POST', options.csrf, '{}');
  }

  async function exportKey(ref: Ref) {
    const key = await originalKey(root, account, ref.project, ref.id, true);
    locked.throwIfAborted();
    return new Uint8Array(await crypto.subtle.exportKey('raw', key));
  }

  return {
    async publishOriginal(ref: Ref, versionId: string, options: RemoteOptions) {
      const { sourceBytes, manifestBytes } = await ready(ref);
      const shape = { sourceBytes, manifestBytes };
      const version = { ...ref, id: versionId };
      const localPart = (part: number) => readPart(ref.id, shape, part);
      if (ref.id === versionId) await uploadParts(ref, shape, options, localPart);
      else {
        const previous = await cipher(ref);
        const next = await cipher(version);
        await uploadParts(version, shape, options, async (part) => {
          const plain = await previous.open(part, await localPart(part));
          try {
            return await next.seal(part, plain);
          } finally {
            new Uint8Array(plain).fill(0);
          }
        });
      }
      return exportKey(version);
    },
    async stage(project: string, file: File, options: Options = {}) {
      locked.throwIfAborted();
      const ref = { project, id: crypto.randomUUID() };
      const manifest = sourceManifest(file);
      const shape = { sourceBytes: file.size, manifestBytes: manifest.byteLength + 16 };
      assertShape(shape);
      const key = await cipher(ref);
      return persist(ref, shape, options, async (part) =>
        key.seal(
          part,
          part === 0
            ? manifest
            : await file.slice((part - 1) * chunkBytes, part * chunkBytes).arrayBuffer(),
        ),
      );
    },
    async metadata(ref: Ref) {
      const shape = await ready(ref);
      const key = await cipher(ref);
      const bytes = await key.open(0, await readPart(ref.id, shape, 0));
      locked.throwIfAborted();
      return parseManifest(bytes, shape);
    },
    async *original(ref: Ref, options: Options = {}) {
      const signal = signalFor(options);
      const shape = await ready(ref);
      const key = await cipher(ref);
      parseManifest(await key.open(0, await readPart(ref.id, shape, 0)), shape);
      for (let part = 1; part <= chunkCount(shape); part++) {
        signal.throwIfAborted();
        const bytes = await key.open(part, await readPart(ref.id, shape, part));
        signal.throwIfAborted();
        yield new Uint8Array(bytes);
        options.progress?.(Math.min(part * chunkBytes, shape.sourceBytes), shape.sourceBytes);
      }
    },
    async removeLocal(ref: Ref) {
      await ready(ref);
      await local.remove(ref.id);
    },
    async enableHosting(project: string, options: RemoteOptions) {
      await request(projectPath(project), signalFor(options), 'PUT', options.csrf, '{}');
    },
    async upload(ref: Ref, options: RemoteOptions) {
      const { sourceBytes, manifestBytes } = await ready(ref);
      const shape = { sourceBytes, manifestBytes };
      await uploadParts(ref, shape, options, (part) => readPart(ref.id, shape, part));
    },
    async cancelUpload(ref: Ref, options: RemoteOptions) {
      await request(filePath(ref), signalFor(options), 'DELETE', options.csrf);
    },
    async download(ref: Ref, options: Options = {}) {
      const path = filePath(ref);
      const signal = signalFor(options);
      const response = await request(path, signal);
      const { sourceBytes, manifestBytes } = (await response.json()) as FileShape;
      const shape = { sourceBytes, manifestBytes };
      assertShape(shape);
      const key = await cipher(ref);
      return persist(ref, shape, options, async (part, signal) => {
        const response = await request(path + '/parts/' + part, signal);
        const size = partBytes(shape, part);
        const bytes = await readBounded(response, size);
        const plaintext = await key.open(part, bytes);
        if (part === 0) parseManifest(plaintext, shape);
        return bytes;
      });
    },
  };
}

export async function readBounded(response: Response, size: number) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Missing ciphertext');
  const bytes = new Uint8Array(size);
  let offset = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value.byteLength > size - offset) throw new Error('Oversized ciphertext');
      bytes.set(value, offset);
      offset += value.byteLength;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  if (offset !== size) throw new Error('Incomplete ciphertext');
  return bytes.buffer;
}
