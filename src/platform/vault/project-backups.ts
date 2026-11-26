import { remapSurfaceImages } from '../projects/surface-attachments';
import { validateProject } from '../projects/projects';
import { projectAssetIds, remapEntityAssets } from '../projects/browser/assets';
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
import type { RestoredOriginal } from './project-store';
import { documentShapes, restoreDocuments } from './backup-documents';
import type { BackupDocuments, DocumentShape } from './backup-documents';
import {
  backupCipher,
  backupHeader,
  backupHeaderBytes,
  backupVersion,
  indexSize,
  maxBackupBytes,
  maxIndexBytes,
} from './backup-format';

type Original = FileShape & { id: string };
type BackupIndex = {
  project: Project;
  projectRevision?: number;
  originals: Original[];
  documents?: DocumentShape[];
};
type Options = {
  signal?: AbortSignal;
  progress?: (fraction: number) => void;
  copy?: { name: string; createdBy: string | null };
};
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

  const ids = projectAssetIds(project);
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

function archiveSize(indexBytes: number, originals: Original[], documents: DocumentShape[] = []) {
  const bytes = originals.reduce(
    (total, shape) => total + shape.manifestBytes + shape.sourceBytes + 16 * chunkCount(shape),
    backupHeaderBytes + indexBytes + documents.reduce((total, shape) => total + shape.bytes, 0),
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
      const captured = await projectDocuments(root, account, stamp, signal).backupRows(projectId);
      if (!captured.project) throw new Error('Project unavailable');
      const project = validateProject(JSON.parse(captured.project) as Project, projectId);
      const originals: Original[] = [];
      for (const id of attachmentIds(project)) {
        signal.throwIfAborted();
        const row = await files.header(id);
        if (!row?.ready || row.project !== projectId) throw new Error('Original unavailable');
        const shape = { id, sourceBytes: row.sourceBytes, manifestBytes: row.manifestBytes };
        assertShape(shape);
        originals.push(shape);
      }
      const records: { kind: keyof BackupDocuments; bytes: Uint8Array<ArrayBuffer> }[] = [];
      for (const kind of ['estimate', 'report'] as const) {
        const text = captured[kind];
        if (text !== undefined) records.push({ kind, bytes: encode.encode(text) });
      }
      const documents = documentShapes(
        records.map(({ kind, bytes }) => ({ kind, bytes: bytes.length + 16 })),
      );
      const index = encode.encode(
        JSON.stringify({
          project,
          projectRevision: captured.revision,
          originals,
          documents,
        } satisfies BackupIndex),
      );
      const total = archiveSize(index.byteLength + 16, originals, documents);
      const header = backupHeader(index.byteLength + 16);
      const code = newCode();
      const archive = await backupCipher(code, header);
      const parts: BlobPart[] = [header, await archive.seal(index)];
      let offset = header.length + index.byteLength + 16;
      for (const record of records) {
        signal.throwIfAborted();
        parts.push(await archive.seal(record.bytes));
        offset += record.bytes.length + 16;
        record.bytes.fill(0);
        options.progress?.(offset / total);
      }
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

      const {
        project,
        projectRevision,
        originals,
        documents: shapes,
      } = JSON.parse(decode.decode(await read(indexBytes))) as BackupIndex;
      const documents = backupVersion(header) === 1 ? [] : documentShapes(shapes);
      if (backupVersion(header) === 1 && shapes !== undefined)
        throw new Error('Invalid legacy index');
      if (!Array.isArray(originals)) throw new Error('Invalid original index');
      const ids = attachmentIds(project);
      for (const shape of originals) {
        assertShape(shape);
        if (!ids.delete(shape.id)) throw new Error('Unexpected or repeated original');
      }
      if (ids.size || archiveSize(indexBytes, originals, documents) !== blob.size)
        throw new Error('Incomplete or oversized backup');

      const id = crypto.randomUUID();
      const records: BackupDocuments = {};
      for (const shape of documents) {
        const plain = await read(shape.bytes);
        try {
          records[shape.kind] = decode.decode(plain);
        } finally {
          new Uint8Array(plain).fill(0);
        }
      }
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
      const next = validateProject(
        {
          ...remapEntityAssets(project, fileIds),
          id,
          ...(project.assets
            ? { assets: project.assets.map((asset) => ({ ...asset, id: fileIds.get(asset.id)! })) }
            : {}),
          objects: project.objects.map((object) => ({
            ...remapEntityAssets(object, fileIds),
            surfaces: object.surfaces.map((surface) =>
              remapEntityAssets(remapSurfaceImages(surface, fileIds), fileIds),
            ),
          })),
        },
        id,
      );
      if (options.copy) {
        const fresh = () => ({
          id: crypto.randomUUID(),
          createdAt: Date.now(),
          updatedAt: Date.now(),
          createdBy: options.copy!.createdBy,
        });
        next.name = options.copy.name;
        next.archived = false;
        next.createdAt = Date.now();
        next.updatedAt = Date.now();
        next.createdBy = options.copy.createdBy;
        next.objects = next.objects.map((object) => ({
          ...object,
          ...fresh(),
          surfaces: object.surfaces.map((surface) => ({
            ...surface,
            ...fresh(),
            checkpoints: surface.checkpoints?.map((checkpoint) => ({
              ...checkpoint,
              id: crypto.randomUUID(),
            })),
          })),
        }));
        validateProject(next, id);
      }
      await projectDocuments(root, account, stamp, signal).restore(
        id,
        JSON.stringify(next),
        restored,
        options.copy ? {} : restoreDocuments(records, project.id, id, fileIds, projectRevision),
      );
      return { ...next, revision: 1 };
    },
  };
}
