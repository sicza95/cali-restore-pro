import type { createAccountAccess } from '../createAccountAccess';

export type InvitationModel = ReturnType<typeof createAccountAccess>;
export type Invitation = { id: string; state: 'pending' | 'accepted' | 'active' };
export type InboxInvitation = Invitation & { projectId: string; expiresAt: string };
export type SentInvitation = Omit<Invitation, 'state'> & {
  state: Invitation['state'] | 'revoked';
  email: string;
  recipientId: string;
  recipientKey?: string;
};
