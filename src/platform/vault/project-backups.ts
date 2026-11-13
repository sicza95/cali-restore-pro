import { validateProject } from '../projects/projects';
import type { Project } from '../projects/types';
import { newCode } from './crypto';
import { localFiles } from './file-store';
import {
  assertID,
  assertShape,
  chunkCount,
  fileCipher,
  parseManifest,
  partBytes,
} from './file-format';
import type { FileShape } from './file-format';
import { projectDocuments } from './project-store';
import { estimateTable, reportTable } from './store';
import type { RestoredOriginal } from './project-store';
import {
  backupCipher,
  backupHeader,
  backupHeaderBytes,
  indexSize,
  maxBackupBytes,
  maxIndexBytes,
} from './backup-format';

export class ReportBackupUnavailable extends Error {}

type Original = FileShape & { id: string };
type BackupIndex = { project: Project; originals: Original[] };
type Options = { signal?: AbortSignal; progress?: (fraction: number) => void };
const encode = new TextEncoder();
const decode = new TextDecoder('utf-8', { fatal: true });
const unit = (value: unknown) => value === 'metric' || value === 'imperial';
const name = (value: unknown) => typeof value === 'string' && !!value.trim() && value.length <= 120;

function attachmentIds(project: Project) {
  validateProject(project, project.id);
  assertID(project.id);
  if (
    !name(project.name) ||
    typeof project.archived !== 'boolean' ||
    !Number.isFinite(project.updatedAt) ||
    Math.abs(project.updatedAt) > 8.64e15 ||
    !unit(project.settings.units)
  )
    throw new Error('Invalid project settings');

  const ids = new Set<string>();
  for (const object of project.objects) {
    assertID(object.id);
    if (!name(object.name) || (object.units !== null && !unit(object.units)))
      throw new Error('Invalid restoration object');
    for (const surface of object.surfaces) {
      assertID(surface.id);
      if (!name(surface.name) || (surface.units !== null && !unit(surface.units)))
        throw new Error('Invalid restoration surface');
      for (const image of surface.images) {
        assertID(image.id);
        if (image.role !== 'mapping' && image.role !== 'reference')
          throw new Error('Invalid original role');
        ids.add(image.id);
      }
    }
  }
  return ids;
}

function archiveSize(indexBytes: number, originals: Original[]) {
  const bytes = originals.reduce(
    (total, shape) => total + shape.manifestBytes + shape.sourceBytes + 16 * chunkCount(shape),
    backupHeaderBytes + indexBytes,
  );
  if (indexBytes > maxIndexBytes || bytes > maxBackupBytes) throw new Error('Backup is too large');
  return bytes;
}

export function projectBackups(
  root: CryptoKey,
  account: string,
  stamp: string,
  locked: AbortSignal,
) {
  const files = localFiles(account, stamp);
  const signalFor = (options: Options) =>
    options.signal ? AbortSignal.any([locked, options.signal]) : locked;

  return {
    async export(projectId: string, options: Options = {}) {
      const signal = signalFor(options);
      if (await projectDocuments(root, account, stamp, signal, estimateTable).changed(projectId, 0))
        throw new Error(
          'Estimate-inclusive portable backups are not yet supported; refusing an incomplete backup',
        );
      if (await projectDocuments(root, account, stamp, signal, reportTable).changed(projectId, 0))
        throw new ReportBackupUnavailable(
          'Report-inclusive portable backups are not yet supported',
        );
      const document = await projectDocuments(root, account, stamp, signal).changed(projectId, 0);
      if (!document) throw new Error('Project unavailable');
      const project = validateProject(JSON.parse(document.text) as Project, projectId);
      const originals: Original[] = [];
      for (const id of attachmentIds(project)) {
        signal.throwIfAborted();
        const row = await files.header(id);
        if (!row?.ready || row.project !== projectId) throw new Error('Original unavailable');
        const shape = { id, sourceBytes: row.sourceBytes, manifestBytes: row.manifestBytes };
        assertShape(shape);
        originals.push(shape);
      }
      const index = encode.encode(JSON.stringify({ project, originals } satisfies BackupIndex));
      const total = archiveSize(index.byteLength + 16, originals);
      const header = backupHeader(index.byteLength + 16);
      const code = newCode();
      const archive = await backupCipher(code, header);
      const parts: BlobPart[] = [header, await archive.seal(index)];
      let offset = header.length + index.byteLength + 16;
      for (const shape of originals) {
        const source = await fileCipher(root, account, projectId, shape.id);
        for (let part = 0; part <= chunkCount(shape); part++) {
          signal.throwIfAborted();
          const bytes = await files.read(shape.id, part);
          if (bytes?.byteLength !== partBytes(shape, part)) throw new Error('Original incomplete');
          const plain = await source.open(part, bytes);
          try {
            if (part === 0) parseManifest(plain, shape);
            parts.push(await archive.seal(plain));
          } finally {
            new Uint8Array(plain).fill(0);
          }
          offset += bytes.byteLength;
          options.progress?.(offset / total);
        }
      }
      signal.throwIfAborted();
      return { blob: new Blob(parts, { type: 'application/octet-stream' }), code };
    },

    async import(blob: Blob, code: string, options: Options = {}) {
      const signal = signalFor(options);
      if (blob.size < backupHeaderBytes || blob.size > maxBackupBytes)
        throw new Error('Invalid backup size');
      const header = new Uint8Array(await blob.slice(0, backupHeaderBytes).arrayBuffer());
      const indexBytes = indexSize(header);
      const archive = await backupCipher(code, header);
      let offset = backupHeaderBytes;
      const read = async (size: number) => {
        signal.throwIfAborted();
        if (offset + size > blob.size) throw new Error('Incomplete backup');
        const bytes = await blob.slice(offset, offset + size).arrayBuffer();
        offset += size;
        const plain = await archive.open(bytes);
        return plain;
      };

      const { project, originals } = JSON.parse(
        decode.decode(await read(indexBytes)),
      ) as BackupIndex;
      if (!Array.isArray(originals)) throw new Error('Invalid original index');
      const ids = attachmentIds(project);
      for (const shape of originals) {
        assertShape(shape);
        if (!ids.delete(shape.id)) throw new Error('Unexpected or repeated original');
      }
      if (ids.size || archiveSize(indexBytes, originals) !== blob.size)
        throw new Error('Incomplete or oversized backup');

      const id = crypto.randomUUID();
      const fileIds = new Map<string, string>();
      const restored: RestoredOriginal[] = [];
      for (const shape of originals) {
        const fileId = crypto.randomUUID();
        fileIds.set(shape.id, fileId);
        const destination = await fileCipher(root, account, id, fileId);
        const parts: ArrayBuffer[] = [];
        for (let part = 0; part <= chunkCount(shape); part++) {
          const plain = await read(partBytes(shape, part));
          try {
            if (part === 0) parseManifest(plain, shape);
            parts.push(await destination.seal(part, plain));
          } finally {
            new Uint8Array(plain).fill(0);
          }
          options.progress?.(offset / blob.size);
        }
        restored.push({
          id: fileId,
          header: {
            project: id,
            ready: true,
            started: Date.now(),
            sourceBytes: shape.sourceBytes,
            manifestBytes: shape.manifestBytes,
          },
          parts,
        });
      }
      for (const object of project.objects)
        for (const surface of object.surfaces)
          for (const image of surface.images) image.id = fileIds.get(image.id)!;
      const next = { ...project, id };
      await projectDocuments(root, account, stamp, signal).restore(
        id,
        JSON.stringify(next),
        restored,
      );
      return { ...next, revision: 1 };
    },
  };
}
