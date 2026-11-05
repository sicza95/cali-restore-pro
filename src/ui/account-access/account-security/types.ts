import type { createAccountAccess } from '../createAccountAccess';

export type AccountSecurityProps = {
  model: Pick<
    ReturnType<typeof createAccountAccess>,
    | 'account'
    | 'busy'
    | 'confirmed'
    | 'lang'
    | 'refreshSessions'
    | 'revokeAll'
    | 'revokeConfirmed'
    | 'revokeSession'
    | 'sessionError'
    | 'sessions'
    | 'setRevokeConfirmed'
    | 'submit'
    | 't'
  >;
};
