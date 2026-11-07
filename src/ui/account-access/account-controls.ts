import { registerPlatformControls } from './register-platform-controls';

export const accountControls = [
  ...registerPlatformControls(
    {
      composition: 'Application shell',
      owner: 'M-01',
      permission: 'Public or signed-in shell',
      valueSource: 'Session and status endpoints',
      helpKey: 'accessHelp',
      unavailable: {
        failure: 'Show the current retryable error.',
        empty: 'Expose the applicable retry action.',
        locked: 'Vault state does not affect status checks.',
      },
    },
    [
      [
        'app.session.retry',
        'retryAccess',
        'Reload and recheck the session',
        'Session lookup failed',
      ],
      ['app.service.retry', 'check', 'Read service status', 'App shell loaded'],
    ],
  ),
  ...registerPlatformControls(
    {
      composition: 'Public authentication forms',
      owner: 'M-01',
      permission: 'Public',
      valueSource: 'Credentials or single-use link token and identity API',
      helpKey: 'accessHelp',
      unavailable: {
        failure:
          'Show neutral request acknowledgment or localized invalid-link and credential error.',
        empty: 'Omit token-dependent form without token.',
        locked: 'Public authentication does not require an unlocked vault.',
      },
    },
    [
      ['auth.login', 'login', 'Create account session', 'Valid credentials and active account'],
      ['auth.register', 'submit', 'Start account registration', 'Email and valid new password'],
      [
        'auth.verify-email',
        'submit',
        'Verify email with single-use token',
        'Verification token supplied',
      ],
      [
        'auth.confirm-email',
        'submit',
        'Confirm changed email with single-use token',
        'Email change token supplied',
      ],
      ['auth.forgot-password', 'submit', 'Request a password reset email', 'Email provided'],
      [
        'auth.reset-password',
        'submit',
        'Apply password reset and revoke sessions',
        'Reset token and valid new password',
      ],
      ['auth.resend.open', 'resend', 'Open verification resend form', 'Verify email page'],
      ['auth.resend', 'resend', 'Request another verification email', 'Email provided'],
    ],
  ),
  ...registerPlatformControls(
    {
      composition: 'Deleted account recovery',
      owner: 'M-07',
      permission: 'Public with account credentials',
      valueSource: 'Server account recovery API',
      helpKey: 'accessHelp',
      unavailable: {
        failure: 'Show generic failure for invalid credentials or expired recovery.',
        empty: 'Show recovery form.',
        locked: 'Recovery does not unlock the vault.',
      },
    },
    [
      [
        'auth.recover-deleted-account',
        'submit',
        'Recover account within live retention',
        'Matching credentials and retained account',
      ],
    ],
  ),
  ...registerPlatformControls(
    {
      composition: 'Account security',
      owner: 'M-01',
      permission: 'Signed-in account',
      valueSource: 'Account credential and session API',
      helpKey: 'sessionHelp',
      unavailable: {
        failure: 'Show the account error and preserve session state.',
        empty: 'Hide row actions without a session.',
        locked: 'Account security is independent of the vault.',
      },
    },
    [
      [
        'account.password.change',
        'changePassword',
        'Submit new password after recent credential confirmation',
        'Recent password confirmation and acknowledgement',
      ],
      [
        'account.email.change',
        'changeEmail',
        'Start verified email change',
        'Recent password confirmation and acknowledgement',
      ],
      [
        'account.sessions.refresh',
        'refresh',
        'Reload current account sessions',
        'Account security page',
      ],
      [
        'account.sessions.revoke',
        'revoke',
        'Revoke the selected session',
        'Confirmed revocation and another session',
      ],
      [
        'account.sessions.revoke-all',
        'revokeAll',
        'Revoke other sessions',
        'Confirmed revocation and other sessions',
      ],
      ['account.confirm', 'confirmPassword', 'Confirm current password', 'Account security page'],
    ],
  ),
  ...registerPlatformControls(
    {
      composition: 'Account lifecycle',
      owner: 'M-07',
      permission: 'Account owner or lifecycle administrator',
      valueSource: 'Deletion continuity, retention and purge APIs',
      helpKey: 'blockedHosted',
      unavailable: {
        failure: 'Show blocked preflight or mutation error.',
        empty: 'Hide mutation until preflight permits it or a deletion is pending.',
        locked: 'Requires account credentials, independent of vault unlock.',
      },
    },
    [
      [
        'account.deletion.preflight',
        'preflight',
        'Request account deletion continuity preflight',
        'Account owner or authorized lifecycle administrator',
      ],
      [
        'account.deletion.purge',
        'purge',
        'Choose to skip live recovery and queue purge',
        'Resolved continuity preflight and permanent deletion choice',
      ],
      [
        'account.deletion.apply',
        'deletion',
        'Request or finalize guarded account deletion',
        'Resolved continuity preflight, required capabilities and recent credential confirmation',
      ],
    ],
  ),
];
