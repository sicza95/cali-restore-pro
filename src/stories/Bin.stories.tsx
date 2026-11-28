import { createSignal } from 'solid-js';
import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import type { BinEntry } from '../platform/projects/bin/types';
import { BinList } from '../ui';
import type { BinRow } from '../ui';

const meta = { title: 'Projects/Bin', parameters: { layout: 'fullscreen' } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

const now = Date.UTC(2026, 10, 27, 12);
const day = 24 * 60 * 60 * 1000;
/** Synthetic in-memory entries; no project data. */
function row(
  index: number,
  kind: BinEntry['entity']['kind'],
  name: string,
  path: string[],
  age: number,
  overrides: Partial<BinEntry> = {},
): BinRow {
  const deletionId = `00000000-0000-4000-8000-00000000000${index}`;
  const projectId = '10000000-0000-4000-8000-000000000001';
  const entity =
    kind === 'project'
      ? { kind, projectId }
      : kind === 'object'
        ? { kind, projectId, objectId: deletionId }
        : { kind, projectId, objectId: deletionId, surfaceId: deletionId };
  const deletedAt = now - age * day;
  const recoverUntil = deletedAt + 30 * day;
  return {
    entry: {
      deletionId,
      scope: 'local',
      organisationId: null,
      entity,
      state: 'retained',
      version: 1,
      deletedAt,
      deletedBy: null,
      recoverUntil,
      provisional: false,
      manifest: null,
      coverage: { included: [], missing: [], legacy: false },
      counts: { objects: 1, surfaces: 3, photos: 6 },
      sourceRevision: 1,
      operationId: deletionId,
      pending: null,
      ...overrides,
    },
    name,
    path,
    state: recoverUntil <= now ? 'expired' : 'recoverable',
    days: Math.max(0, Math.ceil((recoverUntil - now) / day)),
  };
}
const rows = [
  row(
    1,
    'surface',
    'North wall, upper register with a long localized name',
    ['Chapel restoration', 'Altar'],
    1,
  ),
  row(2, 'object', 'Altar', ['Chapel restoration'], 12),
  row(3, 'project', 'Manor staircase', [], 29),
  row(4, 'surface', 'Ceiling', ['Manor staircase', 'Hall'], 31),
];

export const Entries: Story = {
  render: () => {
    const [busy, setBusy] = createSignal<string | null>(null);
    return (
      <main class="cr-story-page">
        <header class="cr-story-title">
          <h1>Bin</h1>
          <p>Deleted work stays recoverable for 30 days; expired entries wait for removal.</p>
        </header>
        <BinList
          language="en"
          rows={rows}
          busy={busy()}
          onRestore={(entry) => setBusy(entry.entry.deletionId)}
          onPurge={() => undefined}
          onInfo={() => undefined}
        />
      </main>
    );
  },
};

export const Hungarian: Story = {
  render: () => (
    <main class="cr-story-page">
      <BinList
        language="hu"
        rows={rows}
        busy={null}
        onRestore={() => undefined}
        onPurge={() => undefined}
        onInfo={() => undefined}
      />
    </main>
  ),
};

const pending = (stage: 'queued' | 'dispatched' | 'conflict', failure?: 'quota_exceeded') => ({
  scope: 'hosted' as const,
  provisional: true,
  pending: { intent: 'trash' as const, operationId: 'op', stage, ...(failure ? { failure } : {}) },
});
const hostedRows = [
  row(5, 'surface', 'South wall', ['Chapel restoration', 'Altar'], 0, pending('queued')),
  row(6, 'object', 'Pulpit', ['Chapel restoration'], 0, pending('dispatched')),
  row(
    7,
    'surface',
    'Vault rib',
    ['Chapel restoration', 'Nave'],
    0,
    pending('conflict', 'quota_exceeded'),
  ),
  row(8, 'surface', 'Door panel', ['Chapel restoration', 'Door'], 2, { scope: 'hosted' }),
];

/** Hosted deletions: waiting, sending, refused by the server, and kept on the server. */
export const SyncStates: Story = {
  render: () => (
    <main class="cr-story-page">
      <header class="cr-story-title">
        <h1>Bin sync states</h1>
        <p>Deletions in synchronised projects reach the server Bin with their recovery data.</p>
      </header>
      <BinList
        language="en"
        rows={hostedRows}
        busy={null}
        onRestore={() => undefined}
        onPurge={() => undefined}
        onInfo={() => undefined}
      />
    </main>
  ),
};
