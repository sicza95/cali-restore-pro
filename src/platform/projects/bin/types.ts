/** Bin domain contracts. Wire values match `contracts/openapi.json` (`Bin*` schemas). */

export type BinEntityKind = 'project' | 'object' | 'surface';
/** Original identities. Restore keeps them; copy/import is the only path that assigns new ones. */
export type BinEntityRef =
  | { kind: 'project'; projectId: string }
  | { kind: 'object'; projectId: string; objectId: string }
  | { kind: 'surface'; projectId: string; objectId: string; surfaceId: string };

/** `local`: never hosted, owned by the signed-in vault account. `hosted`: the server is authoritative. */
export type BinScope = 'local' | 'hosted';

/** Stored state of one deletion event. Restored and purged are terminal for that event. */
export type BinEntryState = 'retained' | 'restored' | 'purged';
export type BinPurgeReason = 'requested' | 'expired' | 'project_purged';
/** Derived for display and commands; expiry is enforced from the deadline, not worker timing. */
export type BinAvailability = 'recoverable' | 'expired' | 'restored' | 'purged';

export type BinLifecycleIntent = 'trash' | 'restore' | 'purge' | 'expire';
/** queued: durable locally, not sent. dispatched: sent, outcome unknown until a receipt. */
export type BinPendingStage = 'queued' | 'dispatched' | 'conflict';
export type BinPending = {
  intent: BinLifecycleIntent;
  operationId: string;
  stage: BinPendingStage;
};

/** Saved-content classes a recovery bundle may declare. */
export const coverageClasses = [
  'graph',
  'checkpoints',
  'journals',
  'estimates',
  'reports',
  'issued',
  'assets',
] as const;
export type BinCoverageClass = (typeof coverageClasses)[number];
export type BinCoverage = {
  included: BinCoverageClass[];
  missing: BinCoverageClass[];
  /** Captured under the pre-Bin protocol; restore only what `included` names. */
  legacy: boolean;
};

export type BinChunk = { index: number; sha256: string; bytes: number };
/** Saved document identity and the version captured. Keys are stable per document type. */
export type BinDocumentVersion = { key: string; version: number };
export type BinCounts = { objects: number; surfaces: number; photos: number };

export type BinManifest = {
  schema: number;
  deletionId: string;
  entity: BinEntityRef;
  /** Every original object/surface ID inside the captured subtree, root first. */
  roots: string[];
  chunks: BinChunk[];
  assets: string[];
  documents: BinDocumentVersion[];
  coverage: BinCoverage;
  sourceRevision: number;
  /** Hosted head epoch at capture; null for local-only projects. */
  sourceEpoch: number | null;
  logicalBytes: number;
  counts: BinCounts;
};
/** Small reference kept on the entry; bodies live in bounded chunks elsewhere. */
export type BinManifestRef = { schema: number; sha256: string };

export type BinEntry = {
  deletionId: string;
  scope: BinScope;
  /** Null is the account's Personal organisation. */
  organisationId: string | null;
  entity: BinEntityRef;
  state: BinEntryState;
  purgeReason?: BinPurgeReason;
  /** Incremented by every transition; commands carry the version they expect. */
  version: number;
  deletedAt: number;
  deletedBy: string | null;
  recoverUntil: number;
  /** Pending hosted deletion: the server starts the 30-day period when it accepts. */
  provisional: boolean;
  manifest: BinManifestRef | null;
  coverage: BinCoverage;
  counts: BinCounts;
  sourceRevision: number;
  operationId: string;
  pending: BinPending | null;
};

/** Kept for the project's lifetime so stale writers cannot resurrect an identity. */
export type BinTerminalFence = {
  entity: BinEntityRef;
  deletionId: string;
  state: 'restored' | 'purged';
  version: number;
  digest: string;
};

export type BinExpectedHead = { revision: number; epoch: number | null };
export type BinOperation = {
  operationId: string;
  intent: BinLifecycleIntent;
  projectId: string;
  deletionIds: string[];
  expectedHead: BinExpectedHead;
  expectedVersions: Record<string, number>;
  /** Set when this command reverses a dispatched one after its receipt. */
  inverseOf?: string;
};
export type BinReceipt = {
  operationId: string;
  digest: string;
  outcome: 'committed' | 'rejected';
  failure?: BinFailureCode;
  versions: Record<string, number>;
};

export const binFailureCodes = [
  'forbidden',
  'hosting_unavailable',
  'quota_exceeded',
  'offline',
  'expired',
  'not_retained',
  'missing_parent',
  'archived_destination',
  'project_purged',
  'incomplete_recovery',
  'identity_collision',
  'stale_revision',
  'pending_sync',
  'digest_mismatch',
  'protocol_outdated',
  'drafts_unresolved',
  'irreversible',
] as const;
export type BinFailureCode = (typeof binFailureCodes)[number];

export type BinAction = 'read' | 'restore' | 'purge' | 'device_export';
export type BinCapability = { allowed: true } | { allowed: false; reason: BinFailureCode };
export type BinCapabilities = Record<BinAction, BinCapability>;

/** Current facts, rechecked on every command. Names and group roles grant nothing here. */
export type BinActor = {
  accountId: string;
  /** Owner or co-owner of the hosted project (every project_owners row is equal). */
  projectOwner: boolean;
  organisationRole: 'admin' | 'member' | null;
  /** Account that owns the local vault holding a local-only entry. */
  localVaultAccount: string | null;
  hostingEntitled: boolean;
  quotaAvailable: boolean;
  exportAllowed: boolean;
  online: boolean;
};
