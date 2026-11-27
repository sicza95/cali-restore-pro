import { newObject, newProject, newSurface } from '../projects';
import type { SavedProjectV2 } from '../types';
import type { BinCommandContext } from './plan-trash';
import type { BinActor } from './types';

/** Synthetic identities for Bin planner tests; no real data. */
export const ids = {
  owner: '11111111-1111-4111-8111-111111111111',
  stranger: '22222222-2222-4222-8222-222222222222',
  photoA: '33333333-3333-4333-8333-333333333333',
  photoB: '44444444-4444-4444-8444-444444444444',
  logo: '55555555-5555-4555-8555-555555555555',
};
export const day = 24 * 60 * 60 * 1000;
export const t0 = 1_800_000_000_000;

export function actor(overrides: Partial<BinActor> = {}): BinActor {
  return {
    accountId: ids.owner,
    projectOwner: true,
    organisationRole: null,
    localVaultAccount: ids.owner,
    hostingEntitled: true,
    quotaAvailable: true,
    exportAllowed: true,
    online: true,
    ...overrides,
  };
}

export function context(overrides: Partial<BinCommandContext> = {}): BinCommandContext {
  return {
    actor: actor(),
    scope: 'local',
    organisationId: null,
    now: t0,
    operationId: 'op-1',
    epoch: null,
    ...overrides,
  };
}

/** Project with two objects; object A has surfaces A1 (photo A, cover on the project) and A2. */
export function project(): SavedProjectV2 {
  const value = newProject('Chapel', null, null, 'EUR', undefined, ids.owner);
  const a = {
    ...newObject('Altar', undefined, ids.owner),
    surfaces: [newSurface('North', ids.owner), newSurface('South', ids.owner)],
  };
  const b = newObject('Door', 'Panel', ids.owner);
  a.surfaces[0]!.images.push({ id: ids.photoA, role: 'mapping' });
  b.surfaces[0]!.images.push({ id: ids.photoB, role: 'reference' });
  b.overrides = { branding: { logo: { assetId: ids.logo } } };
  value.objects.push(a, b);
  value.assets = [{ id: ids.logo, purpose: 'branding' }];
  value.cover = { assetId: ids.photoA };
  value.revision = 7;
  return value;
}
