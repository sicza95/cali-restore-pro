import { describe, expect, it } from 'vitest';
import { context, ids, project, t0 } from './bin-fixtures';
import { assertCaptureCurrent, decodeBundle, encodeBundle } from './bundle';
import { captureRecovery, type BinCaptureReaders, type SavedText } from './capture';
import { isComplete } from './coverage';
import { applyGraphEdits } from './graph';
import { journalRestores, mergeDocument } from './merge';
import { planRestore } from './plan-restore';
import { planTrash } from './plan-trash';
import { collectableAssets, reachableAssets, type BinReachabilityRoots } from './reachability';

const value = project();
const [a, b] = value.objects;
const [north, south] = a!.surfaces;
const phase = (id: string, surface: string) => ({ id, surface, name: id });
const estimate = (phases: ReturnType<typeof phase>[], currency = 'EUR') =>
  JSON.stringify({
    schema: 1,
    draft: {
      project: value.id,
      currency,
      phases,
      extras: [{ id: 'x-a', object: a!.id }],
      objects: [
        { id: a!.id, name: 'Altar', surfaces: [north!.id, south!.id] },
        { id: b!.id, name: 'Door', surfaces: [b!.surfaces[0]!.id] },
      ],
    },
    snapshots: [{ id: 'issued-1', frozen: true }],
  });
const report = (surfaces: Record<string, unknown>) =>
  JSON.stringify({
    schema: 1,
    project: value.id,
    settings: { surfaces, excluded: [north!.id], notes: 'n' },
  });
function readers(overrides: Partial<BinCaptureReaders> = {}): BinCaptureReaders {
  return {
    journal: async ({ source }) =>
      source === ids.photoA ? { revision: 3, text: '{"j":1}' } : undefined,
    estimate: async () => ({
      revision: 4,
      text: estimate([phase('p-north', north!.id), phase('p-door', b!.surfaces[0]!.id)]),
    }),
    report: async () => ({
      revision: 2,
      text: report({ [north!.id]: { compare: 'a' }, [b!.surfaces[0]!.id]: { compare: 'b' } }),
    }),
    assetBytes: async () => 1000,
    ...overrides,
  };
}
const surfacePlan = () =>
  planTrash(value, { kind: 'surface', objectId: a!.id, surfaceId: north!.id }, 'del-n', context());

describe('recovery bundles', () => {
  it('round-trips a surface with journals and subtree-owned document rows in bounded chunks', async () => {
    const plan = surfacePlan();
    const capture = await captureRecovery(plan, readers());
    const bundle = await encodeBundle(plan, capture, null, 64);
    expect(bundle.chunks.length).toBeGreaterThan(3);
    expect(bundle.chunks.every((chunk) => chunk.length <= 64)).toBe(true);
    expect(bundle.manifest).toMatchObject({
      roots: [north!.id],
      assets: [ids.photoA],
      coverage: { missing: [], legacy: false },
      documents: [
        { key: `journal:${north!.id}:${ids.photoA}`, version: 3 },
        { key: 'estimate', version: 4 },
        { key: 'report', version: 2 },
      ],
    });
    expect(bundle.manifest.logicalBytes).toBeGreaterThan(1000);
    const body = await decodeBundle(bundle.ref, bundle.manifest, bundle.chunks);
    expect(body.captured).toEqual(north);
    expect(body.documents).toEqual([
      {
        kind: 'estimate',
        scope: 'subtree',
        revision: 4,
        rows: {
          phases: [phase('p-north', north!.id)],
          extras: [],
          objects: [{ id: a!.id, name: 'Altar', surfaces: [north!.id] }],
        },
      },
      {
        kind: 'report',
        scope: 'subtree',
        revision: 2,
        rows: { surfaces: { [north!.id]: { compare: 'a' } }, excluded: [north!.id] },
      },
    ]);
  });

  it('restores the decoded graph with original IDs after unrelated edits', async () => {
    const plan = surfacePlan();
    const bundle = await encodeBundle(plan, await captureRecovery(plan, readers()), null);
    const removed = { ...applyGraphEdits(value, plan.edits, new Map(), t0), revision: 8 };
    removed.objects[1]!.name = 'Later edit';
    const body = await decodeBundle(bundle.ref, bundle.manifest, bundle.chunks);
    const entry = { ...plan.entry, coverage: bundle.manifest.coverage, manifest: bundle.ref };
    const payloads = new Map([[entry.deletionId, body.captured]]);
    const restore = planRestore({ project: removed, entry, catalog: [entry], payloads }, context());
    const back = applyGraphEdits(removed, restore.edits, payloads, t0);
    expect(back.objects[0]!.surfaces.find(({ id }) => id === north!.id)).toEqual(north);
    expect(back.objects[1]!.name).toBe('Later edit');
  });

  it('declares missing originals so new hosted deletions can be blocked', async () => {
    const plan = surfacePlan();
    const capture = await captureRecovery(plan, readers({ assetBytes: async () => undefined }));
    expect(capture.missingAssets).toEqual([ids.photoA]);
    const bundle = await encodeBundle(plan, capture, 2);
    expect(bundle.manifest.coverage.missing).toEqual(['assets']);
    expect(isComplete(bundle.manifest.coverage)).toBe(false);
    expect(bundle.manifest.sourceEpoch).toBe(2);
  });

  it('fails closed on unreadable sources, tampering and source changes during capture', async () => {
    const plan = surfacePlan();
    await expect(
      captureRecovery(plan, readers({ journal: async () => Promise.reject(new Error('locked')) })),
    ).rejects.toThrow('locked');
    await expect(
      captureRecovery(plan, readers({ estimate: async () => ({ revision: 1, text: '{' }) })),
    ).rejects.toMatchObject({
      code: 'incomplete_recovery',
    });
    const bundle = await encodeBundle(plan, await captureRecovery(plan, readers()), null, 64);
    const flipped = bundle.chunks.map((chunk) => chunk.slice());
    flipped[1]![0] ^= 1;
    await expect(decodeBundle(bundle.ref, bundle.manifest, flipped)).rejects.toMatchObject({
      code: 'incomplete_recovery',
    });
    await expect(
      decodeBundle(bundle.ref, bundle.manifest, bundle.chunks.slice(1)),
    ).rejects.toMatchObject({ code: 'incomplete_recovery' });
    await expect(
      decodeBundle(bundle.ref, { ...bundle.manifest, roots: ['other'] }, bundle.chunks),
    ).rejects.toMatchObject({
      code: 'incomplete_recovery',
    });
    await expect(
      decodeBundle({ ...bundle.ref, schema: 9 }, { ...bundle.manifest, schema: 9 }, bundle.chunks),
    ).rejects.toMatchObject({
      code: 'protocol_outdated',
    });
    expect(() => assertCaptureCurrent(bundle.manifest, 8)).toThrow(
      expect.objectContaining({ code: 'stale_revision' }),
    );
    expect(() => assertCaptureCurrent(bundle.manifest, 7)).not.toThrow();
  });

  it('captures whole project documents and issued outputs for a project entry', async () => {
    const plan = planTrash(value, { kind: 'project' }, 'del-p', context());
    const capture = await captureRecovery(plan, readers());
    expect(capture.captured).toContain('issued');
    expect(capture.body.documents.map(({ scope }) => scope)).toEqual(['whole', 'whole']);
    expect(capture.body.journals).toHaveLength(1);
  });
});

describe('restore merge', () => {
  it('adds subtree rows back while keeping newer rows, settings and issued snapshots', async () => {
    const capture = await captureRecovery(surfacePlan(), readers());
    const current: SavedText = {
      revision: 9,
      text: estimate([phase('p-new', b!.surfaces[0]!.id)], 'HUF'),
    };
    const merged = mergeDocument(capture.body.documents[0]!, current)!;
    const doc = JSON.parse(merged.text);
    expect(merged.expected).toBe(9);
    expect(doc.draft.currency).toBe('HUF');
    expect(doc.draft.phases.map(({ id }: { id: string }) => id)).toEqual(['p-new', 'p-north']);
    expect(doc.snapshots).toEqual([{ id: 'issued-1', frozen: true }]);
    expect(
      mergeDocument(capture.body.documents[0]!, { revision: 10, text: merged.text }),
    ).toBeNull();
    const reportNow: SavedText = {
      revision: 5,
      text: JSON.stringify({
        schema: 1,
        settings: { surfaces: { other: 1 }, excluded: [], notes: 'n' },
      }),
    };
    const mergedReport = JSON.parse(mergeDocument(capture.body.documents[1]!, reportNow)!.text);
    expect(mergedReport.settings).toEqual({
      surfaces: { other: 1, [north!.id]: { compare: 'a' } },
      excluded: [north!.id],
      notes: 'n',
    });
    const kept: SavedText = { revision: 6, text: report({ [north!.id]: { compare: 'kept' } }) };
    // Current values for the same row win; nothing changed means no write.
    expect(mergeDocument(capture.body.documents[1]!, kept)).toBeNull();
    expect(
      mergeDocument({ kind: 'report', scope: 'whole', revision: 1, text: 'x' }, reportNow),
    ).toBeNull();
    expect(
      mergeDocument({ kind: 'report', scope: 'whole', revision: 1, text: 'x' }, undefined),
    ).toEqual({
      kind: 'report',
      text: 'x',
      expected: 0,
    });
  });

  it('restores journals under original keys and blocks conflicting rows', async () => {
    const { body } = await captureRecovery(surfacePlan(), readers());
    const key = `${north!.id}:${ids.photoA}`;
    expect(journalRestores(value.id, body.journals, new Map())).toEqual([
      {
        ref: { project: value.id, surface: north!.id, source: ids.photoA },
        expected: 0,
        text: '{"j":1}',
      },
    ]);
    expect(
      journalRestores(value.id, body.journals, new Map([[key, { revision: 1, text: '{"j":1}' }]])),
    ).toEqual([]);
    expect(() =>
      journalRestores(value.id, body.journals, new Map([[key, { revision: 1, text: 'other' }]])),
    ).toThrow(expect.objectContaining({ code: 'identity_collision' }));
  });
});

describe('asset reachability', () => {
  const roots = (overrides: Partial<BinReachabilityRoots> = {}): BinReachabilityRoots => ({
    projects: [],
    manifests: [],
    historical: [],
    pending: [],
    leases: [],
    legacy: [],
    ...overrides,
  });
  it('keeps shared, retained, historical, pending, leased and legacy assets', () => {
    const live = applyGraphEdits(value, surfacePlan().edits, new Map(), t0);
    const candidates = [ids.photoA, ids.photoB, 'h', 'q', 'l', 'old', 'free'];
    expect(
      collectableAssets(
        candidates,
        roots({
          projects: [live],
          manifests: [{ assets: ['h'] }],
          historical: ['h'],
          pending: ['q'],
          leases: [{ assetId: 'l', until: t0 + 1 }],
          legacy: ['old'],
        }),
        t0,
      ),
    ).toEqual(['free', ids.photoA].sort());
    expect(reachableAssets(roots({ leases: [{ assetId: 'l', until: t0 }] }), t0).has('l')).toBe(
      false,
    );
    expect(reachableAssets(roots({ projects: [value] }), t0).has(ids.logo)).toBe(true);
  });
});
