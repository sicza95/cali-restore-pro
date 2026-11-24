import { registerPlatformControls } from '../account-access/register-platform-controls';

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
      [
        'app.toast.close',
        'closeMessage',
        'Close the floating message before its time runs out',
        'A message is showing',
      ],
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
      [
        'auth.register',
        'submit',
        'Send a sign-up link and six-digit code (or an existing-account notice)',
        'Email address',
      ],
      [
        'auth.register.code',
        'codeLabel',
        'Check the six-digit code once the last digit is typed',
        'Code step after the email was sent',
      ],
      ['auth.register.resend', 'resendCode', 'Send a fresh link and code', 'Code step'],
      ['auth.register.other-email', 'useOtherEmail', 'Return to the email step', 'Code step'],
      [
        'auth.register.complete',
        'register',
        'Set the first password, activate the account and sign in',
        'Valid code or link and a matching new password',
      ],
      [
        'auth.confirm-email',
        'submit',
        'Confirm changed email with single-use token',
        'Email change token supplied',
      ],
      [
        'auth.forgot-password',
        'submit',
        'Send a reset link and code (or a sign-up code to an address with no account)',
        'Email address, filled in from the sign-in page when known',
      ],
      [
        'auth.reset.code',
        'codeLabel',
        'Check the six-digit code once the last digit is typed',
        'Code step after the reset email was sent',
      ],
      ['auth.reset.resend', 'resendCode', 'Send a fresh link and code', 'Code step'],
      ['auth.reset.other-email', 'useOtherEmail', 'Return to the email step', 'Code step'],
      [
        'auth.reset-password',
        'savePassword',
        'Set the new password, end other sessions and passkeys, and sign in',
        'Valid code or link and a matching new password',
      ],
    ],
  ),
  ...registerPlatformControls(
    {
      composition: 'Remembered accounts on the sign-in page',
      owner: 'M-01',
      permission: 'Public',
      valueSource: 'Email addresses remembered in this browser after a successful sign-in',
      helpKey: 'accessHelp',
      unavailable: {
        failure: 'Unreadable storage shows the email step.',
        empty: 'No remembered account shows the email step.',
        locked: 'Remembered accounts hold no credentials or vault data.',
      },
    },
    [
      ['auth.remember', 'rememberMe', 'Keep the email on this device after sign-in', 'Email step'],
      [
        'auth.remembered.choose',
        'chooseAccount',
        'Continue to the password step for a remembered account',
        'Account remembered on this device',
      ],
      [
        'auth.remembered.another',
        'useAnotherAccount',
        'Show the email step',
        'Remembered accounts on this device',
      ],
      [
        'auth.remembered.edit',
        'removeAccount',
        'Show a remove button on each remembered account',
        'Remembered accounts on this device',
      ],
      [
        'auth.remembered.forget',
        'forgetAccount',
        'Remove the account from this device',
        'Remove mode',
      ],
      ['auth.remembered.done', 'doneRemoving', 'Leave remove mode', 'Remove mode'],
      [
        'auth.remembered.back',
        'accountsOnDevice',
        'Return from the email step to the account list',
        'Email step with remembered accounts',
      ],
      [
        'auth.switch-account',
        'switchAccount',
        'Return to the account list or the email step',
        'Password step',
      ],
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
      composition: 'Passkey sign-in',
      owner: 'M-03',
      permission: 'Public sign-in; changes need a signed-in account',
      valueSource: 'Browser passkey ceremony and identity passkey API',
      helpKey: 'passkeyHelp',
      unavailable: {
        failure: 'Show cancelled, rejected or unavailable passkey error; password sign-in stays.',
        empty: 'Hide passkey actions on IP-address origins and browsers without passkeys.',
        locked: 'A passkey signs in only; the vault unlocks separately.',
      },
    },
    [
      ['auth.passkey', 'passkeySignIn', 'Sign in with a discoverable passkey', 'Login page'],
      [
        'account.passkeys.add',
        'addPasskey',
        'Register a passkey for this account',
        'Passkey name; the password when no confirmation is recent',
      ],
      [
        'account.passkeys.password',
        'password',
        'Password that confirms adding a passkey',
        'Shown only when the last confirmation has lapsed',
      ],
      [
        'account.passkeys.remove',
        'removePasskey',
        'Remove the selected passkey',
        'Recent password confirmation and acknowledgement',
      ],
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
