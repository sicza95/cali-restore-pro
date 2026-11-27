import { projectAssetIds } from '../browser/assets';
import type { Project } from '../types';

/** Every root that keeps a stored file alive. */
export type BinReachabilityRoots = {
  /** Live project graphs (includes dedicated cover/branding assets). */
  projects: readonly Project[];
  /** Recovery manifests of entries that are not yet purged. */
  manifests: readonly { assets: readonly string[] }[];
  /** Assets referenced by issued documents, checkpoints, journals and history. */
  historical: Iterable<string>;
  /** Queued operations and in-flight uploads or restores. */
  pending: Iterable<string>;
  /** Short-lived leases held by running work; expired leases no longer protect. */
  leases: readonly { assetId: string; until: number }[];
  /** Pre-Bin references that are not classified: kept conservatively. */
  legacy: Iterable<string>;
};

/** Extends `projectAssetIds` with Bin, historical, pending, leased and legacy roots. */
export function reachableAssets(roots: BinReachabilityRoots, now: number): Set<string> {
  const ids = new Set<string>();
  for (const project of roots.projects) for (const id of projectAssetIds(project)) ids.add(id);
  for (const manifest of roots.manifests) for (const id of manifest.assets) ids.add(id);
  for (const id of roots.historical) ids.add(id);
  for (const id of roots.pending) ids.add(id);
  for (const id of roots.legacy) ids.add(id);
  for (const lease of roots.leases) if (lease.until > now) ids.add(lease.assetId);
  return ids;
}

/**
 * Candidates released by a purge that no other root still references. Physical deletion runs
 * only for these, so purging one entry never breaks a shared photo elsewhere.
 */
export function collectableAssets(
  candidates: Iterable<string>,
  roots: BinReachabilityRoots,
  now: number,
): string[] {
  const reachable = reachableAssets(roots, now);
  return [...new Set(candidates)].filter((id) => !reachable.has(id)).sort();
}
