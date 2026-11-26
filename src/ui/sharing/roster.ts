import type { ProjectOwner, SentInvitation } from './types';

/** A live co-owner's snapshot belongs in their owner row, not in a second member row. */
export function ownerInvitation(invitations: SentInvitation[], owner: string) {
  return invitations.find(
    (item) => item.coOwner && item.state === 'active' && item.recipientId === owner,
  );
}

export function separateInvitations(invitations: SentInvitation[], owners: ProjectOwner[]) {
  return invitations.filter(
    (item) =>
      !(
        item.coOwner &&
        item.state === 'active' &&
        owners.some((owner) => owner.id === item.recipientId)
      ),
  );
}
