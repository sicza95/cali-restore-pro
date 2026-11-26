import type { ProjectOwner } from './types';

/** Mirrors the server guards; the server rechecks after every concurrent change. */
export function ownerRemovalReason(
  owner: ProjectOwner,
  count: number,
): 'lastOwner' | 'hostOwner' | undefined {
  if (count <= 1) return 'lastOwner';
  if (owner.host) return 'hostOwner';
  return undefined;
}
