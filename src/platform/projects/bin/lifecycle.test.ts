import { describe, expect, it } from 'vitest';
import { actor, ids, project, t0 } from './bin-fixtures';
import { binRecoveryMs } from './constants';
import { compactReceipt, operationDigest, replay } from './digest';
import { planExpiry, planPurge, resurrectedIds, terminalFence } from './plan-purge';
import { binCapabilities } from './policy';
import { batches, organisationCatalog, selectEmptyBin, selectMatching } from './selection';
import { cancelPending, transition } from './states';
import type { BinEntityRef, BinEntry, BinOperation } from './types';

const value = project();
const [a, b] = value.objects;
let sequence = 0;
function entry(entity: BinEntityRef, overrides: Partial<BinEntry> = {}): BinEntry {
  sequence += 1;
  return {
    deletionId: `d${sequence}`,
    scope: 'local',
    organisationId: null,
    entity,
    state: 'retained',
    version: 1,
    deletedAt: t0,
    deletedBy: ids.owner,
    recoverUntil: t0 + binRecoveryMs,
    provisional: false,
    manifest: null,
    coverage: { included: ['graph', 'assets'], missing: [], legacy: false },
    counts: { objects: 0, surfaces: 1, photos: 0 },
    sourceRevision: 7,
    operationId: `op${sequence}`,
    pending: null,
    ...overrides,
  };
}
const projectRef: BinEntityRef = { kind: 'project', projectId: value.id };
const objectRef: BinEntityRef = { kind: 'object', projectId: value.id, objectId: a!.id };
const surfaceRef: BinEntityRef = {
  kind: 'surface',
  projectId: value.id,
  objectId: a!.id,
  surfaceId: a!.surfaces[0]!.id,
};
const otherRef: BinEntityRef = {
  kind: 'surface',
  projectId: 'p2',
  objectId: b!.id,
  surfaceId: 's2',
};
const target = ({ deletionId, version }: BinEntry) => ({ deletionId, version });

describe('planPurge', () => {
  it('cascades a project purge once and keeps independent project groups apart', () => {
    const p = entry(projectRef);
    const o = entry(objectRef);
    const s = entry(surfaceRef);
    const other = entry(otherRef);
    const plan = planPurge([p, s, other].map(target), [p, o, s, other], actor(), t0);
    expect(plan.groups.map(({ projectId }) => projectId).sort()).toEqual([value.id, 'p2'].sort());
    const group = plan.groups.find(({ projectId }) => projectId === value.id)!;
    expect(group.entries.map(({ deletionId }) => deletionId).sort()).toEqual(
      [p, o, s].map(({ deletionId }) => deletionId).sort(),
    );
    expect(group.cascaded).toEqual([o.deletionId]);
    expect(plan.counts).toEqual({ selected: 3, cascaded: 1, total: 4 });
    expect(group.transitions.find(({ deletionId }) => deletionId === o.deletionId)).toMatchObject({
      state: 'purged',
      purgeReason: 'project_purged',
      version: 2,
    });
  });

  it('keeps a separately retained surface when its object is purged', () => {
    const o = entry(objectRef);
    const s = entry(surfaceRef);
    const plan = planPurge([target(o)], [o, s], actor(), t0);
    expect(plan.groups[0]!.entries.map(({ deletionId }) => deletionId)).toEqual([o.deletionId]);
  });

  it('reports stale, denied and offline targets instead of executing them', () => {
    const o = entry(objectRef);
    const hosted = entry(surfaceRef, { scope: 'hosted' });
    const gone = entry(otherRef, { state: 'restored', version: 2 });
    const stale = planPurge(
      [{ deletionId: o.deletionId, version: 9 }, target(gone)],
      [o, gone],
      actor(),
      t0,
    );
    expect(stale.denied).toEqual([
      { deletionId: o.deletionId, reason: 'stale_revision' },
      { deletionId: gone.deletionId, reason: 'not_retained' },
    ]);
    expect(
      planPurge([target(hosted)], [hosted], actor({ online: false }), t0).denied[0]!.reason,
    ).toBe('offline');
    const member = actor({ projectOwner: false, organisationRole: 'member' });
    expect(planPurge([target(hosted)], [hosted], member, t0).denied[0]!.reason).toBe('forbidden');
  });

  it('purges with zero quota or no hosting and still allows reading', () => {
    const hosted = entry(objectRef, { scope: 'hosted' });
    const limited = actor({ hostingEntitled: false, quotaAvailable: false });
    expect(planPurge([target(hosted)], [hosted], limited, t0).groups).toHaveLength(1);
    const capabilities = binCapabilities(hosted, limited, t0);
    expect(capabilities.read).toEqual({ allowed: true });
    expect(capabilities.restore).toEqual({ allowed: false, reason: 'hosting_unavailable' });
  });
});

describe('expiry and fences', () => {
  it('expires by deadline, cascades a project and skips provisional entries', () => {
    const p = entry(projectRef);
    const late = entry(objectRef, { recoverUntil: t0 + 2 * binRecoveryMs });
    const pending = entry(otherRef, { provisional: true });
    const result = planExpiry([p, late, pending], t0 + binRecoveryMs);
    expect(result.map(({ deletionId, purgeReason }) => [deletionId, purgeReason])).toEqual([
      [p.deletionId, 'expired'],
      [late.deletionId, 'project_purged'],
    ]);
    expect(binCapabilities(entry(objectRef), actor(), t0 + binRecoveryMs).restore).toEqual({
      allowed: false,
      reason: 'expired',
    });
  });

  it('fences purged identities against stale writers, while a later restore wins', () => {
    const s = entry(surfaceRef);
    const purged = transition(s, 'purge', t0);
    const fence = terminalFence(purged, 'digest');
    expect(fence).toMatchObject({ state: 'purged', version: 2, deletionId: s.deletionId });
    expect(resurrectedIds([a!.surfaces[0]!.id, a!.id], [fence])).toEqual([a!.surfaces[0]!.id]);
    const restored = terminalFence(transition(entry(surfaceRef), 'restore', t0), 'digest-2');
    expect(resurrectedIds([a!.surfaces[0]!.id], [fence, restored])).toEqual([]);
    expect(() => terminalFence(s, 'x')).toThrow(expect.objectContaining({ code: 'not_retained' }));
  });
});

describe('transitions', () => {
  it('treats restored and purged as terminal', () => {
    const restored = transition(entry(objectRef), 'restore', t0);
    expect(() => transition(restored, 'purge', t0)).toThrow(
      expect.objectContaining({ code: 'not_retained' }),
    );
    expect(() => transition(entry(objectRef), 'expire', t0)).toThrow(
      expect.objectContaining({ code: 'not_retained' }),
    );
  });

  it('drops queued intents and reverses dispatched ones only after their receipt', () => {
    expect(cancelPending(null)).toEqual({ kind: 'none' });
    expect(cancelPending({ intent: 'trash', operationId: 'o', stage: 'queued' })).toEqual({
      kind: 'drop',
    });
    expect(cancelPending({ intent: 'trash', operationId: 'o', stage: 'dispatched' })).toEqual({
      kind: 'inverse',
      intent: 'restore',
      after: 'o',
    });
    expect(cancelPending({ intent: 'restore', operationId: 'o', stage: 'conflict' })).toMatchObject(
      { intent: 'trash' },
    );
    expect(() => cancelPending({ intent: 'purge', operationId: 'o', stage: 'dispatched' })).toThrow(
      expect.objectContaining({ code: 'irreversible' }),
    );
  });
});

describe('idempotency', () => {
  const operation: BinOperation = {
    operationId: 'op',
    intent: 'purge',
    projectId: value.id,
    deletionIds: ['b', 'a'],
    expectedHead: { revision: 3, epoch: 1 },
    expectedVersions: { a: 1, b: 2 },
  };
  it('digests canonically and rejects altered reuse of an operation ID', async () => {
    const digest = await operationDigest(operation);
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(
      await operationDigest({
        ...operation,
        deletionIds: ['a', 'b'],
        expectedVersions: { b: 2, a: 1 },
      }),
    ).toBe(digest);
    const altered = await operationDigest({ ...operation, expectedVersions: { a: 1, b: 3 } });
    expect(altered).not.toBe(digest);
    const receipt = {
      operationId: 'op',
      digest,
      outcome: 'committed' as const,
      versions: { a: 2 },
    };
    const receipts = new Map([['op', receipt]]);
    expect(replay(receipts, 'op', digest)).toBe(receipt);
    expect(replay(receipts, 'new', digest)).toBeUndefined();
    expect(() => replay(receipts, 'op', altered)).toThrow(
      expect.objectContaining({ code: 'digest_mismatch' }),
    );
    expect(compactReceipt(receipt)).toEqual({ ...receipt, versions: {} });
  });
});

describe('selection', () => {
  it('freezes matching targets, excludes later arrivals and scopes Empty Bin to the organisation', () => {
    const first = entry(objectRef, { organisationId: 'org' });
    const second = entry(surfaceRef, { organisationId: 'org' });
    const queued = entry(otherRef, {
      organisationId: 'org',
      pending: { intent: 'trash', operationId: 'q', stage: 'queued' },
    });
    const catalog = [first, second, queued];
    const matching = selectMatching(catalog, 'org', (row) => row.entity.kind === 'object');
    expect(matching.targets).toEqual([target(first)]);
    // Queued intents are selectable for restore review but excluded from Empty Bin.
    expect(selectMatching(catalog, 'org', () => true).targets).toHaveLength(3);
    expect(selectEmptyBin(catalog, 'org')).toEqual({
      scope: 'empty_bin',
      organisationId: 'org',
      targets: [first, second].map(target),
    });
  });

  it('shows local entries of unavailable organisations under Personal only', () => {
    const local = entry(objectRef, { organisationId: 'gone' });
    const hosted = entry(surfaceRef, { organisationId: 'gone', scope: 'hosted' });
    const personal = entry(otherRef);
    expect(
      organisationCatalog([local, hosted, personal], null, new Set()).map(
        ({ deletionId }) => deletionId,
      ),
    ).toEqual([local.deletionId, personal.deletionId]);
    expect(organisationCatalog([local, hosted], 'gone', new Set(['gone']))).toHaveLength(2);
  });

  it('batches per project within the size limit', () => {
    const rows = Array.from({ length: 5 }, () => entry(objectRef));
    const other = entry(otherRef);
    const groups = batches([...rows, other].map(target), [...rows, other], 2);
    expect(groups.map(({ projectId, targets }) => [projectId, targets.length])).toEqual([
      [value.id, 2],
      [value.id, 2],
      [value.id, 1],
      ['p2', 1],
    ]);
  });
});
