import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, expect, it, vi } from 'vitest';
import { backupRecords } from '../../../tests-platform/fixtures/backup-records';
import { newProject } from '../projects/projects';
import { calculate } from '../estimates/calculate';
import { importCode, maxLocalDocument } from './crypto';
import {
  backupCipher,
  backupHeader,
  backupVersion,
  indexSize,
  maxIndexBytes,
} from './backup-format';
import { documentShapes, restoreDocuments } from './backup-documents';
import { projectBackups } from './project-backups';
import { projectDocuments } from './project-store';
import { connect, estimateTable, reportTable, vaultTable } from './store';

const account = 'backup-test';
const code = 'ab'.repeat(32);
const signal = new AbortController().signal;
let root: CryptoKey;
const projects = () => projectDocuments(root, account, 'stamp', signal);
const records = (table: typeof estimateTable | typeof reportTable) =>
  projectDocuments(root, account, 'stamp', signal, table);
const backups = () => projectBackups(root, account, 'stamp', signal);
const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));

beforeEach(async () => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  root = await importCode(code);
  const db = await connect();
  await new Promise<void>((resolve) => {
    const tx = db.transaction(vaultTable, 'readwrite');
    tx.objectStore(vaultTable).put({ stamp: 'stamp' }, account);
    tx.oncomplete = () => resolve();
  });
  db.close();
});

async function archive(index: unknown, version = 2, frames: Uint8Array<ArrayBuffer>[] = []) {
  const bytes = encode(index);
  const header = backupHeader(bytes.length + 16);
  header[7] = version === 1 ? 49 : 48 + version;
  const cipher = await backupCipher(code, header);
  const parts: BlobPart[] = [header, await cipher.seal(bytes)];
  for (const frame of frames) parts.push(await cipher.seal(frame));
  return new Blob(parts);
}

it('exports v2 and restores estimate history and report configuration under the new identity', async () => {
  const project = newProject('Backup', 'Object', 'Surface', 'EUR');
  const { estimate, report } = backupRecords(project.id);
  await projects().save(project.id, 0, JSON.stringify(project));
  await records(estimateTable).save(project.id, 0, JSON.stringify(estimate));
  await records(reportTable).save(project.id, 0, JSON.stringify(report));
  const { blob, code } = await backups().export(project.id);
  expect(new TextDecoder().decode(await blob.slice(0, 8).arrayBuffer())).toBe('CRPROJ02');
  const restored = await backups().import(blob, code);
  const next = JSON.parse((await records(estimateTable).changed(restored.id, 0))!.text);
  expect(next).toEqual(
    JSON.parse(
      restoreDocuments(
        { estimate: JSON.stringify(estimate) },
        project.id,
        restored.id,
        new Map(),
        1,
      ).estimate!,
    ),
  );
  expect(next.snapshots[0].result).toEqual(estimate.snapshots[0]!.result);
  expect(next.snapshots[0].input.revision).toBe(0);
  expect(JSON.parse((await records(reportTable).changed(restored.id, 0))!.text)).toEqual({
    ...report,
    project: restored.id,
    projectRevision: 0,
  });
});

it.each([true, false])(
  'preserves snapshot and report freshness at backup (current: %s)',
  async (current) => {
    const project = newProject('Freshness', 'Object', 'Surface', 'EUR');
    const { estimate, report } = backupRecords(project.id);
    const sourceRevision = current ? 7 : 1;
    estimate.draft.revision = sourceRevision;
    estimate.snapshots[0]!.input.revision = sourceRevision;
    report.projectRevision = sourceRevision;
    for (let revision = 0; revision < 7; revision++)
      await projects().save(project.id, revision, JSON.stringify(project));
    await records(estimateTable).save(project.id, 0, JSON.stringify(estimate));
    await records(reportTable).save(project.id, 0, JSON.stringify(report));
    const exported = await backups().export(project.id);
    const restored = await backups().import(exported.blob, exported.code);
    const next = JSON.parse((await records(estimateTable).changed(restored.id, 0))!.text);
    const draft = JSON.parse((await records(reportTable).changed(restored.id, 0))!.text);
    expect(next.draft.revision).toBe(current ? 1 : 0);
    expect(next.snapshots[0].input.revision).toBe(current ? 1 : 0);
    expect(draft.projectRevision).toBe(current ? 1 : 0);
  },
);

it('captures project, estimate and report in one readonly transaction', async () => {
  const project = newProject('Atomic export', 'Object', 'Surface', 'EUR');
  const { estimate, report } = backupRecords(project.id);
  await projects().save(project.id, 0, JSON.stringify(project));
  await records(estimateTable).save(project.id, 0, JSON.stringify(estimate));
  await records(reportTable).save(project.id, 0, JSON.stringify(report));
  const transaction = vi.spyOn(IDBDatabase.prototype, 'transaction');
  const get = IDBObjectStore.prototype.get;
  let update: Promise<number> | undefined;
  vi.spyOn(IDBObjectStore.prototype, 'get').mockImplementation(function (
    this: IDBObjectStore,
    key,
  ) {
    if (this.name === 'encrypted-projects' && !update) {
      update = records(reportTable).save(
        project.id,
        1,
        JSON.stringify({
          ...report,
          settings: { ...report.settings, notes: 'Changed concurrently' },
        }),
      );
    }
    return get.call(this, key);
  });
  const exported = await backups().export(project.id);
  await update;
  const restored = await backups().import(exported.blob, exported.code);
  const capturedReport = JSON.parse((await records(reportTable).changed(restored.id, 0))!.text);
  expect(capturedReport.settings.notes).toBe(report.settings.notes);
  expect(JSON.parse((await records(reportTable).changed(project.id, 0))!.text).settings.notes).toBe(
    'Changed concurrently',
  );
  expect(
    transaction.mock.calls.some(
      ([tables, mode]) =>
        mode === 'readonly' &&
        Array.isArray(tables) &&
        [estimateTable, reportTable, 'encrypted-projects'].every((table) => tables.includes(table)),
    ),
  ).toBe(true);
});

it.each([1, 2])('restores v%i archives without estimate or report records', async (version) => {
  const project = newProject('Old backup', 'Object', 'Surface', 'EUR');
  const blob = await archive(
    { project, originals: [], ...(version === 2 ? { documents: [] } : {}) },
    version,
  );
  const restored = await backups().import(blob, code);
  expect(restored.name).toBe(project.name);
  expect(restored.id).not.toBe(project.id);
  expect(await records(estimateTable).list()).toEqual([]);
  expect(await records(reportTable).list()).toEqual([]);
});

it.each(['estimate', 'report'] as const)(
  'round-trips a project with only a saved %s',
  async (kind) => {
    const project = newProject('One record', 'Object', 'Surface', 'EUR');
    const document = JSON.stringify(backupRecords(project.id)[kind]);
    const table = kind === 'estimate' ? estimateTable : reportTable;
    await projects().save(project.id, 0, JSON.stringify(project));
    await records(table).save(project.id, 0, document);
    const { blob, code } = await backups().export(project.id);
    const restored = await backups().import(blob, code);
    expect(await records(table).changed(restored.id, 0)).toBeDefined();
    expect(await records(kind === 'estimate' ? reportTable : estimateTable).list()).toEqual([]);
  },
);

it('translates committed measurement revisions while preserving snapshot results', () => {
  const { estimate } = backupRecords('source');
  for (const input of [estimate.draft, estimate.snapshots[0]!.input]) {
    input.phases[0]!.quantity!.source = 'committed';
    input.phases[0]!.quantity!.revision = '7/photo/2/3';
  }
  estimate.snapshots[0]!.result = calculate(estimate.snapshots[0]!.input);
  const result = restoreDocuments(
    { estimate: JSON.stringify(estimate) },
    'source',
    'copy',
    new Map(),
    7,
  );
  const next = JSON.parse(result.estimate!);
  expect(next.snapshots[0].input.phases[0].quantity.revision).toBe('1/photo/2/3');
  expect(next.snapshots[0].result).toEqual(estimate.snapshots[0]!.result);
});

it('rejects foreign project records and inconsistent issued results', () => {
  const { estimate, report } = backupRecords('source');
  expect(() =>
    restoreDocuments({ report: JSON.stringify(report) }, 'other', 'copy', new Map()),
  ).toThrow();
  estimate.snapshots[0]!.result.total = '0.00';
  expect(() =>
    restoreDocuments({ estimate: JSON.stringify(estimate) }, 'source', 'copy', new Map()),
  ).toThrow('snapshot mismatch');
});

it('remaps photo references without changing issued identifiers or results', () => {
  const { estimate, report } = backupRecords('source', 'photo');
  const result = restoreDocuments(
    { estimate: JSON.stringify(estimate), report: JSON.stringify(report) },
    'source',
    'copy',
    new Map([['photo', 'new-photo']]),
  );
  const next = JSON.parse(result.estimate!);
  expect(next.draft.phases[0].scopeSource).toBe('new-photo');
  expect(next.draft.phases[0].quantity.project).toBe('copy');
  expect(next.snapshots[0]).toMatchObject({
    id: estimate.snapshots[0]!.id,
    createdAt: estimate.snapshots[0]!.createdAt,
    result: estimate.snapshots[0]!.result,
  });
  expect(JSON.parse(result.report!).settings.surfaces['surface-a'].references).toEqual([
    'new-photo',
  ]);
});

it('rejects unknown versions, malformed headers and oversized indexes', () => {
  const header = backupHeader(32);
  expect(backupVersion(header)).toBe(2);
  expect(() => indexSize(header.slice(1))).toThrow();
  header[7] = 51;
  expect(() => indexSize(header)).toThrow();
  expect(() => indexSize(backupHeader(maxIndexBytes + 1))).toThrow();
});

it.each([
  undefined,
  [{ kind: 'unknown', bytes: 17 }],
  [{ kind: 'estimate', bytes: 16 }],
  [{ kind: 'estimate', bytes: 4 * maxLocalDocument + 17 }],
  [
    { kind: 'report', bytes: 17 },
    { kind: 'report', bytes: 17 },
  ],
])('rejects invalid document indexes: %j', (shapes) => {
  expect(() => documentShapes(shapes)).toThrow();
});

it('rejects tampered, missing and trailing document bytes without writing any project', async () => {
  const project = newProject('Invalid', 'Object', 'Surface', 'EUR');
  const { report } = backupRecords(project.id);
  const frame = encode(report);
  const blob = await archive(
    { project, originals: [], documents: [{ kind: 'report', bytes: frame.length + 16 }] },
    2,
    [frame],
  );
  const last = new Uint8Array(await blob.slice(-1).arrayBuffer());
  last[0] = last[0]! ^ 1;
  for (const invalid of [
    new Blob([blob.slice(0, -1), last]),
    blob.slice(0, -1),
    new Blob([blob, last]),
  ])
    await expect(backups().import(invalid, code)).rejects.toThrow();
  expect(await projects().list()).toEqual([]);
  expect(await records(reportTable).list()).toEqual([]);
});

it('rolls back all records when a report write aborts the restore transaction', async () => {
  const project = newProject('Atomic', 'Object', 'Surface', 'EUR');
  const { estimate, report } = backupRecords(project.id);
  const add = IDBObjectStore.prototype.add;
  vi.spyOn(IDBObjectStore.prototype, 'add').mockImplementation(function (
    this: IDBObjectStore,
    value,
    key,
  ) {
    const request = add.call(this, value, key);
    if (this.name === reportTable) request.onsuccess = () => this.transaction.abort();
    return request;
  });
  await expect(
    projects().restore(project.id, JSON.stringify(project), [], {
      estimate: JSON.stringify(estimate),
      report: JSON.stringify(report),
    }),
  ).rejects.toThrow();
  expect(await projects().list()).toEqual([]);
  expect(await records(estimateTable).list()).toEqual([]);
  expect(await records(reportTable).list()).toEqual([]);
});

it('retains document size limits before any restore write', async () => {
  const project = newProject('Limits', 'Object', 'Surface', 'EUR');
  await expect(
    projects().restore(project.id, JSON.stringify(project), [], {
      report: 'x'.repeat(64 * 1024 + 1),
    }),
  ).rejects.toThrow('Text too large');
  expect(await projects().list()).toEqual([]);
});
