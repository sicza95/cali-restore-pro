import { registerPlatformControls } from '../register-platform-controls';

export const settingsControls = [
  ...registerPlatformControls(
    {
      composition: 'Account preferences',
      owner: 'M-02',
      permission: 'Signed-in account',
      valueSource: 'Account-keyed local preferences form',
      helpKey: 'localHelp',
      unavailable: {
        failure: 'Show storage or input error and retain form inputs.',
        empty: 'Use device defaults.',
        locked: 'Preferences remain available with the vault locked.',
      },
    },
    [
      ['preferences.save', 'save', 'Persist account-local preferences', 'Preferences form'],
      ['preferences.theme', 'theme', 'Set app color theme preference', 'Preferences form'],
      [
        'preferences.transparency',
        'opaque',
        'Set reduced transparency preference',
        'Preferences form',
      ],
      ['preferences.units', 'units', 'Select area display default', 'Preferences form'],
      ['preferences.currency', 'currency', 'Select new project currency', 'Preferences form'],
      [
        'preferences.report-language',
        'reportLanguage',
        'Select independent report language default',
        'Preferences form',
      ],
      ['preferences.snap', 'snap', 'Record drawing snap preference', 'Preferences form'],
      ['preferences.branding.studio', 'studio', 'Enter report studio name', 'Preferences form'],
      ['preferences.branding.contact', 'contact', 'Enter report contact', 'Preferences form'],
      ['preferences.branding.footer', 'footer', 'Enter report footer', 'Preferences form'],
      ['preferences.branding.accent', 'accent', 'Choose report accent', 'Preferences form'],
      ['preferences.branding.logo', 'logo', 'Choose a PNG logo', 'Preferences form'],
      [
        'preferences.branding.clear-logo',
        'removeLogo',
        'Clear logo in the pending form',
        'Pending or saved logo',
      ],
      ['preferences.diagnostics', 'optIn', 'Record diagnostics consent', 'Preferences form'],
    ],
  ),
  ...registerPlatformControls(
    {
      composition: 'Private libraries',
      owner: 'M-08',
      permission: 'Signed-in account and unlocked personal vault',
      valueSource: 'Application navigation',
      helpKey: 'help',
      unavailable: {
        failure: 'Show gate or route error.',
        empty: 'Show empty library.',
        locked: 'Show vault gate.',
      },
    },
    [
      [
        'libraries.branding',
        'branding',
        'Open report branding preferences',
        'Unlocked personal libraries',
      ],
    ],
  ),
  ...registerPlatformControls(
    {
      composition: 'Private estimate libraries',
      owner: 'M-09',
      permission: 'Signed-in account and unlocked personal vault',
      valueSource: 'No library provider in M-08',
      helpKey: 'help',
      behavior: 'review',
      unavailable: {
        failure: 'Keep preset controls disabled with explanation.',
        empty: 'Keep preset controls disabled until M-09.',
        locked: 'Hide library controls at the vault gate.',
      },
    },
    [
      [
        'libraries.rates',
        'rates',
        'Manage private rate presets',
        'M-09 encrypted estimate library',
      ],
      [
        'libraries.productivity',
        'productivity',
        'Manage private productivity presets',
        'M-09 encrypted estimate library',
      ],
    ],
  ),
  ...registerPlatformControls(
    {
      composition: 'Administration',
      owner: 'M-02',
      permission: 'Individual server read capability',
      valueSource: 'Authorized account page or minimized operations API',
      helpKey: 'noAccess',
      unavailable: {
        failure: 'Show authorization or request error.',
        empty: 'Show empty results or omit cursor action.',
        locked: 'Admin authorization is independent of vault state.',
      },
    },
    [
      ['admin.search.query', 'searchLabel', 'Enter bounded email prefix', 'accounts.view'],
      ['admin.search', 'search', 'Read matching account page', 'accounts.view'],
      [
        'admin.confirm',
        'confirmPassword',
        'Obtain recent password confirmation',
        'accounts.view and current password',
      ],
      [
        'admin.previous',
        'previous',
        'Read previous cursor page',
        'accounts.view and previous cursor',
      ],
      ['admin.next', 'next', 'Read next cursor page', 'accounts.view and next cursor'],
      [
        'admin.operations.refresh',
        'refreshOperations',
        'Read minimized audit and operations summary',
        'operations.view',
      ],
      [
        'admin.operations.mail',
        'mailJobs',
        'Expand mail job statuses',
        'operations.view and loaded job status',
      ],
    ],
  ),
  ...registerPlatformControls(
    {
      composition: 'Administration account row',
      owner: 'M-02',
      permission: 'Current capability for this action and authorized account target',
      valueSource: 'Account policy, feature grant, quota and session API',
      helpKey: 'adminPasswordHelp',
      unavailable: {
        failure: 'Reject invalid role, quota or privilege change and retain current policy.',
        empty: 'Omit forms for ineligible accounts.',
        locked: 'Vault state does not grant platform rights.',
      },
    },
    [
      ['admin.account.open', 'accounts', 'Expand authorized account summary', 'accounts.view'],
      [
        'admin.account.role',
        'role',
        'Select platform role',
        'accounts.suspend plus roles.manage on an eligible account',
      ],
      [
        'admin.account.state',
        'state',
        'Select active or suspended account state',
        'accounts.suspend on an eligible account',
      ],
      [
        'admin.account.policy',
        'changePolicy',
        'Apply account policy with capability checks',
        'accounts.suspend and recent credential confirmation',
      ],
      [
        'admin.account.grant',
        'granted',
        'Select server feature eligibility',
        'accounts.entitlements on an eligible account',
      ],
      [
        'admin.account.quota',
        'quota',
        'Set account storage limit',
        'accounts.entitlements on an eligible account',
      ],
      [
        'admin.account.entitlements',
        'saveEntitlement',
        'Apply hosting eligibility and quota',
        'accounts.entitlements and recent credential confirmation',
      ],
      [
        'admin.account.delegate',
        'saveDelegation',
        'Apply bounded admin permissions',
        'roles.manage, administrator target and recent credential confirmation',
      ],
      [
        'admin.account.revoke',
        'revokeAll',
        'Revoke target account sessions',
        'accounts.sessions.revoke, another account and recent credential confirmation',
      ],
    ],
  ),
];
