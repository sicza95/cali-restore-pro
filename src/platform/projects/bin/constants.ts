/** Matches hosted-project recovery (`project_deletions`, 720 hours). */
export const binRecoveryMs = 30 * 24 * 60 * 60 * 1000;
export const binManifestSchema = 1;
/**
 * Writers below this protocol do not understand lifecycle manifests or fences. Every reader,
 * writer and worker must reach it before new Bin writes are enabled; older writers are rejected.
 */
export const binWriterProtocol = 2;
/** Initial bulk limits; measure before raising. */
export const binBatchSize = 100;
export const binBatchConcurrency = 2;
/** Recovery bodies are stored in bounded chunks, never inside the 65,552-byte revision head. */
export const binChunkBytes = 1024 * 1024;

/**
 * Lock order for every lifecycle command, local or hosted. Taking locks in this order and
 * committing graph head, entry transition, pins, fence and receipt in one transaction is the
 * CAS boundary: either all of them change or none does.
 */
export const binLockOrder = [
  'lifecycle', // shared for access, exclusive for transitions (server advisory lock 702090)
  'account',
  'project-head', // revision/epoch compare-and-set
  'bin-entries', // ascending deletionId
  'asset-pins', // ascending asset id
  'receipts',
] as const;
