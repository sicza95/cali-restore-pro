import { describe, expect, it } from 'vitest';
import { ownerRemovalReason } from './owner-guards';
import { ownerInvitation, separateInvitations } from './roster';
import type { SentInvitation } from './types';

const host = { id: 'host', email: 'host@example.test', host: true };
const owner = { id: 'owner', email: 'owner@example.test', host: false };
const invitation = (
  id: string,
  state: SentInvitation['state'],
  coOwner = false,
): SentInvitation => ({
  id,
  state,
  coOwner,
  recipientId: id,
  email: id + '@example.test',
  estimateScope: 'none',
  shareHistory: false,
});

describe('member roster', () => {
  it('combines a live co-owner with their snapshot while retaining every other invitation state', () => {
    const active = invitation('owner', 'active', true);
    const pending = invitation('future-owner', 'pending', true);
    const accepted = invitation('accepted-owner', 'accepted', true);
    const recipient = invitation('reader', 'active');
    const revoked = invitation('former-owner', 'revoked', true);
    const rows = [active, pending, accepted, recipient, revoked];
    expect(ownerInvitation(rows, owner.id)).toBe(active);
    expect(ownerInvitation(rows, host.id)).toBeUndefined();
    expect(separateInvitations(rows, [host, owner])).toEqual([
      pending,
      accepted,
      recipient,
      revoked,
    ]);
    expect(separateInvitations(rows, [host])).toEqual(rows);
  });

  it('keeps pending or revoked co-owner invitations distinct even when the recipient is an owner', () => {
    const rows = [invitation('owner', 'pending', true), invitation('host', 'revoked', true)];
    expect(ownerInvitation(rows, 'owner')).toBeUndefined();
    expect(separateInvitations(rows, [host, owner])).toEqual(rows);
  });

  it('prevents removal of the last owner or hosting owner with actionable reasons', () => {
    expect(ownerRemovalReason(host, 1)).toBe('lastOwner');
    expect(ownerRemovalReason(owner, 1)).toBe('lastOwner');
    expect(ownerRemovalReason(host, 2)).toBe('hostOwner');
    expect(ownerRemovalReason(owner, 2)).toBeUndefined();
  });
});
