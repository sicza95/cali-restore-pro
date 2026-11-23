import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, expect, it, onTestFinished, vi } from 'vitest';
import { aead } from './aead';
import { newProject } from '../projects/projects';
import { importCode } from './crypto';
import { projectBackups } from './project-backups';
import { projectDocuments } from './project-store';
import { recipientReportDocuments } from './recipient-reports';
import { connect, recipientReportTable, reportTable, vaultTable } from './store';

const owner = 'owner-account';
const recipient = 'recipient-account';
const project = '00000000-0000-4000-8000-0000000000d1';
const invitation = '00000000-0000-4000-8000-0000000000d2';
const other = '00000000-0000-4000-8000-0000000000d3';
const signal = new AbortController().signal;
let root: CryptoKey;
const store = (account = recipient, stamp = 'stamp') =>
  recipientReportDocuments(root, account, stamp, signal);

async function rawRows(table: string) {
  const db = await connect();
  try {
    return await new Promise<unknown[]>((resolve) => {
      const request = db.transaction(table).objectStore(table).getAll();
      request.onsuccess = () => resolve(request.result as unknown[]);
    });
  } finally {
    db.close();
  }
}

beforeEach(async () => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  root = await importCode('cd'.repeat(32));
  const db = await connect();
  await new Promise<void>((resolve) => {
    const tx = db.transaction(vaultTable, 'readwrite');
    tx.objectStore(vaultTable).put({ stamp: 'stamp' }, owner);
    tx.objectStore(vaultTable).put({ stamp: 'stamp' }, recipient);
    tx.oncomplete = () => resolve();
  });
  db.close();
});

it('keys recipient drafts by project and invitation and checks the expected revision', async () => {
  const key = { project, invitation };
  expect(await store().load(key)).toBeUndefined();
  expect(await store().save(key, 0, 'first')).toBe(1);
  await expect(store().save(key, 0, 'stale')).rejects.toThrow();
  expect(await store().save({ project, invitation: other }, 0, 'second grant')).toBe(1);
  expect(await store().save(key, 1, 'updated')).toBe(2);
  expect(await store().load(key)).toEqual({ ...key, revision: 2, text: 'updated' });
  expect((await store().list()).map(({ invitation, text }) => [invitation, text])).toEqual([
    [invitation, 'updated'],
    [other, 'second grant'],
  ]);
  expect(await store(owner).list()).toEqual([]);
  await expect(store(recipient, 'other-stamp').load(key)).rejects.toThrow();
  await expect(store().remove(key, 1)).rejects.toThrow();
  await store().remove(key, 2);
  expect(await store().load(key)).toBeUndefined();
  await expect(store().load({ project: 'not-an-id', invitation })).rejects.toThrow();
});

it('seals each draft to its key so a row moved to another grant does not open', async () => {
  aead.enabled = true;
  onTestFinished(() => {
    aead.enabled = false;
  });
  await store().save({ project, invitation }, 0, 'Private recipient notes');
  const rows = await rawRows(recipientReportTable);
  expect(JSON.stringify(rows)).not.toContain('Private recipient notes');
  const db = await connect();
  await new Promise<void>((resolve) => {
    const tx = db.transaction(recipientReportTable, 'readwrite');
    const moved = { ...(rows[0] as object), invitation: other };
    tx.objectStore(recipientReportTable).put(moved, [recipient, project, other]);
    tx.oncomplete = () => resolve();
  });
  db.close();
  await expect(store().load({ project, invitation: other })).rejects.toThrow();
});

it('leaves the owner report table and portable backups without recipient drafts', async () => {
  const owned = newProject('Owner chapel', 'North wall', 'Upper plaster', 'EUR');
  await projectDocuments(root, owner, 'stamp', signal).save(owned.id, 0, JSON.stringify(owned));
  await store().save({ project: owned.id, invitation }, 0, 'Recipient only');
  expect(await rawRows(reportTable)).toEqual([]);
  const rows = await projectDocuments(root, owner, 'stamp', signal).backupRows(owned.id);
  expect(rows.report).toBeUndefined();
  const { blob } = await projectBackups(root, owner, 'stamp', signal).export(owned.id);
  expect(blob.size).toBeGreaterThan(0);
  const recipientRows = await projectDocuments(root, recipient, 'stamp', signal).backupRows(
    owned.id,
  );
  expect(recipientRows).toEqual({
    revision: undefined,
    project: undefined,
    estimate: undefined,
    report: undefined,
  });
});
