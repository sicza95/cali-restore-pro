import { IDBFactory } from 'fake-indexeddb';
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RevisionError, openRevision, revisionBlockFor } from '../projects/revisions';
import type { RevisionKey, RevisionState, RevisionWrite } from '../projects/revisions';
import { importCode, newCode } from './crypto';
import { revisionQueue } from './revision-queue';
import { connect, vaultTable } from './store';

const account = '11111111-1111-4111-8111-111111111111';
const epoch = '22222222-2222-4222-8222-222222222222';
const projectA = 'aaaaaaaa-0000-4000-8000-000000000001';
const projectB = 'bbbbbbbb-0000-4000-8000-000000000002';
const empty: RevisionState = { epoch, head: null };

type Reply = { status: number; error?: string } | 'ack' | 'bad-ack';
let replies: Reply[];
let writes: { project: string; csrf: string | null; body: RevisionWrite }[];

// A stand-in for the hosted revision endpoint: replies in order, then acknowledges.
function server(input: string | URL | Request, init?: RequestInit) {
  const project = String(input).split('/').at(-2)!;
  const body = JSON.parse(String(init?.body)) as RevisionWrite;
  writes.push({ project, csrf: new Headers(init?.headers).get('X-CSRF-Token'), body });
  const reply = replies.shift() ?? 'ack';
  if (typeof reply === 'object')
    return Promise.resolve(Response.json({ error: reply.error }, { status: reply.status }));
  const head = { ...body, revision: body.expected + 1 + (reply === 'bad-ack' ? 1 : 0) };
  return Promise.resolve(Response.json({ epoch, head } satisfies RevisionState));
}

async function writeVault(stamp: string) {
  const db = await connect();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(vaultTable, 'readwrite');
    tx.objectStore(vaultTable).put({ stamp }, account);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

let root: CryptoKey;
let key: RevisionKey;
let stamp: string;
let controller: AbortController;
const queue = () => revisionQueue(root, account, () => stamp, controller.signal);

beforeEach(async () => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('fetch', vi.fn(server));
  replies = [];
  writes = [];
  stamp = 'stamp-1';
  controller = new AbortController();
  root = await importCode(newCode());
  key = { epoch, key: await importCode(newCode()) };
  await writeVault(stamp);
});

afterEach(() => {
  controller.abort();
  vi.useRealTimers();
});

describe('revisionQueue', () => {
  it('stages an encrypted draft and drains it to the server', async () => {
    const q = queue();
    const id = await q.stage(projectA, empty, key, 'first text');
    expect(await q.drafts()).toEqual([
      { id, project: projectA, expected: 0, epoch, blocked: undefined },
    ]);
    expect(await q.retry('csrf-1')).toBe(false);
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ project: projectA, csrf: 'csrf-1', body: { expected: 0 } });
    expect(await q.drafts()).toEqual([]);
    // The server only ever sees ciphertext that the project key opens.
    const head = { ...writes[0]!.body, revision: 1 };
    expect(await openRevision(projectA, head, key)).toBe('first text');
  });

  it('drains drafts in project-id order, not staging order', async () => {
    const q = queue();
    await q.stage(projectB, empty, key, 'b');
    await q.stage(projectA, empty, key, 'a');
    await q.retry('csrf');
    expect(writes.map((w) => w.project)).toEqual([projectA, projectB]);
  });

  it('bases the write on the current head revision', async () => {
    const q = queue();
    await q.stage(
      projectA,
      { epoch, head: { epoch, revision: 4, salt: '', ciphertext: '' } },
      key,
      'x',
    );
    expect((await q.drafts())[0]!.expected).toBe(4);
  });

  it('keeps one draft per project and refuses to overwrite it unseen', async () => {
    const q = queue();
    await q.stage(projectA, empty, key, 'one');
    await expect(q.stage(projectA, empty, key, 'two')).rejects.toThrow('A queued edit changed');
    expect(await q.drafts()).toHaveLength(1);
  });

  it.each<[string, Reply]>([
    ['a server error', { status: 503, error: 'unavailable' }],
    ['rate limiting', { status: 429, error: 'rate_limited' }],
    ['a pending original rotation', { status: 409, error: 'original_rotation_pending' }],
    ['a mismatched acknowledgement', 'bad-ack'],
  ])('keeps the draft for retry after %s', async (_label, reply) => {
    const q = queue();
    replies = [reply];
    await q.stage(projectA, empty, key, 'text');
    expect(await q.retry('csrf')).toBe(true);
    expect(await q.drafts()).toEqual([expect.objectContaining({ blocked: undefined })]);
    expect(await q.retry('csrf')).toBe(false);
    expect(writes).toHaveLength(2);
    expect(writes[0]!.body).toEqual(writes[1]!.body);
    expect(await q.drafts()).toEqual([]);
  });

  it.each<[string, Reply, string]>([
    ['a conflict', { status: 409, error: 'revision_conflict' }, 'conflict'],
    ['an epoch change', { status: 409, error: 'revision_epoch_changed' }, 'epoch'],
    ['lost access', { status: 403, error: 'forbidden' }, 'access'],
    ['a rejection', { status: 400, error: 'invalid_revision' }, 'rejected'],
  ])('blocks the draft on %s and stops sending it', async (_label, reply, blocked) => {
    const q = queue();
    replies = [reply];
    await q.stage(projectA, empty, key, 'text');
    await q.stage(projectB, empty, key, 'other');
    expect(await q.retry('csrf')).toBe(false);
    expect(await q.drafts()).toEqual([expect.objectContaining({ project: projectA, blocked })]);
    await q.retry('csrf');
    expect(writes.map((w) => w.project)).toEqual([projectA, projectB]);
  });

  it('lets a blocked draft be reviewed, then resolved or discarded', async () => {
    const q = queue();
    replies = [{ status: 409, error: 'revision_conflict' }];
    const id = await q.stage(projectA, empty, key, 'mine');
    await q.retry('csrf');
    expect(await q.review(projectA)).toEqual({ id, blocked: 'conflict', text: 'mine' });

    const next = await q.resolve(projectA, id, empty, key, 'merged');
    expect(await q.drafts()).toEqual([expect.objectContaining({ id: next, blocked: undefined })]);
    expect(await q.discard(projectA, next)).toBe(false); // only blocked drafts can be discarded
    await q.retry('csrf');
    expect(await openRevision(projectA, { ...writes[1]!.body, revision: 1 }, key)).toBe('merged');

    replies = [{ status: 409, error: 'revision_conflict' }];
    const again = await q.stage(projectA, empty, key, 'later');
    await q.retry('csrf');
    expect(await q.discard(projectA, again)).toBe(true);
    expect(await q.drafts()).toEqual([]);
  });

  it('shares one drain between concurrent retries', async () => {
    const q = queue();
    await q.stage(projectA, empty, key, 'text');
    const [a, b] = [q.retry('csrf'), q.retry('csrf')];
    expect(a).toBe(b);
    await a;
    expect(writes).toHaveLength(1);
  });

  it('refuses to touch the queue after the vault is replaced', async () => {
    const q = queue();
    await q.stage(projectA, empty, key, 'text');
    stamp = 'stamp-2';
    await expect(q.drafts()).rejects.toThrow('Vault changed');
  });

  it('retries in the background with doubling delays', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    vi.stubGlobal('navigator', { onLine: true });
    vi.stubGlobal('window', new EventTarget());
    const q = queue();
    replies = [
      { status: 503, error: 'unavailable' },
      { status: 503, error: 'unavailable' },
    ];
    await q.stage(projectA, empty, key, 'text');
    const errors: unknown[] = [];
    const stop = q.start(
      () => Promise.resolve('csrf'),
      (error) => errors.push(error),
    );
    // IndexedDB work runs on real macrotasks, so poll with setImmediate (left unfaked) until the
    // queue has sent `count` writes and re-armed or released its timer; fake time stays frozen.
    const settle = async (count: number, timers: number) => {
      for (let i = 0; i < 2000; i++) {
        if (writes.length === count && vi.getTimerCount() === timers) return;
        await new Promise((resolve) => setImmediate(resolve));
      }
      throw new Error(`Stuck at ${writes.length} writes, ${vi.getTimerCount()} timers`);
    };
    await settle(0, 1);
    await vi.advanceTimersByTimeAsync(0);
    await settle(1, 1); // 503 → next try in 1 s
    await vi.advanceTimersByTimeAsync(999);
    expect(writes).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    await settle(2, 1); // 503 → next try in 2 s
    await vi.advanceTimersByTimeAsync(1999);
    expect(writes).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    await settle(3, 0); // acknowledged → nothing scheduled
    expect(await q.drafts()).toEqual([]);
    expect(errors).toEqual([]);
    expect(() =>
      q.start(
        () => Promise.resolve('csrf'),
        () => {},
      ),
    ).toThrow('already active');
    stop();
  });
});

it('retains queued edits and cloud checkpoints while paused, including after reopening', async () => {
  const q = queue();
  await q.enableEditor(projectA, epoch);
  await q.stageEditor((await q.checkpoints())[0]!, 1, key, 'queued local work');
  await q.setPaused(projectA, true);
  const reopened = queue();
  await reopened.retry('csrf');
  expect(writes).toHaveLength(0);
  expect(await reopened.drafts()).toHaveLength(1);
  expect((await reopened.checkpoints())[0]?.paused).toBe(true);
  await reopened.setPaused(projectA, false);
  await reopened.retry('csrf');
  expect(writes).toHaveLength(1);
  expect(await reopened.drafts()).toEqual([]);
});

describe('revisionBlockFor', () => {
  it.each<[unknown, string | undefined]>([
    [new RevisionError(409, 'revision_conflict'), 'conflict'],
    [new RevisionError(409, 'revision_epoch_changed'), 'epoch'],
    [new RevisionError(401, 'unauthorized'), 'access'],
    [new RevisionError(403, 'forbidden'), 'access'],
    [new RevisionError(404, 'not_found'), 'access'],
    [new RevisionError(409, 'original_rotation_pending'), undefined],
    [new RevisionError(429, 'rate_limited'), undefined],
    [new RevisionError(500, 'internal'), undefined],
    [new RevisionError(503, 'unavailable'), undefined],
    [new RevisionError(400, 'invalid_revision'), 'rejected'],
    [new RevisionError(413, 'too_large'), 'rejected'],
    [new TypeError('Failed to fetch'), undefined],
  ])('maps %o to %s', (error, expected) => {
    expect(revisionBlockFor(error)).toBe(expected);
  });
});

it('remembers hosting independently of sync, including local-only projects offline', async () => {
  const q = queue();
  expect(await q.hosting(projectA)).toBeUndefined();
  await q.hosting(projectA, false);
  expect(await queue().hosting(projectA)).toBe(false);
  expect(await q.checkpoints()).toEqual([]);
  await q.hosting(projectA, true);
  expect(await queue().hosting(projectA)).toBe(true);
  await q.forgetEditor(projectA);
  expect(await queue().hosting(projectA)).toBe(false);
});
