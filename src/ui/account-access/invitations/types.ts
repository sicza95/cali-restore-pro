import type { createAccountAccess } from '../createAccountAccess';
import type { ScopeSelection } from '../../../platform/projects/sharing-scopes';

export type InvitationModel = ReturnType<typeof createAccountAccess>;
export type Invitation = ScopeSelection & {
  id: string;
  state: 'pending' | 'accepted' | 'active';
  coOwner: boolean;
};
export type InboxInvitation = Invitation & { projectId: string; expiresAt: string };
export type SentInvitation = Omit<Invitation, 'state'> & {
  state: Invitation['state'] | 'revoked';
  email: string;
  recipientId: string;
  recipientKey?: string;
  sourceIds?: string[];
};
