import type { ControlContract } from '../control-registry/types';
import { accountPaths } from '../router/constants';

const destinations = {
  ...accountPaths,
  offline: '/offline-originals',
  login: '/login',
  register: '/register',
} as const;

type Destination = keyof typeof destinations;
function navigationControl(
  labelKey: Destination,
  permission: string,
  prerequisite: string,
  owner: ControlContract['owner'],
): ControlContract & { href: string; labelKey: Destination } {
  const href = destinations[labelKey];
  return {
    id: 'app.nav.' + labelKey.replace('/', '.'),
    href,
    labelKey,
    helpKey: labelKey === 'admin' ? 'noAccess' : 'accessHelp',
    command: 'GET ' + href,
    permission,
    prerequisite,
    valueSource: 'Application route and current account capabilities',
    behavior: 'functional',
    owner,
    composition: 'Application navigation',
    unavailable: {
      failure: 'Show the connection error and retry control.',
      empty: 'Destination shows its own empty state.',
      locked: 'Protected content stays behind its existing vault unlock.',
    },
  };
}

export const accountNavigationControls = [
  navigationControl(
    'projects',
    'signed-in',
    'Project library, project detail and surface routes',
    'M-05',
  ),
  navigationControl(
    'invitations',
    'signed-in',
    'Invitation inbox requires unlocked vault for inbox',
    'M-06',
  ),
  navigationControl('libraries', 'signed-in', 'Pattern library requires unlocked vault', 'M-05'),
  navigationControl(
    'offline',
    'Explicit offline account marker',
    'Offline originals requires unlocked vault for files',
    'M-07',
  ),
  navigationControl('admin', 'accounts.view or operations.view', 'Administration', 'M-02'),
  navigationControl('login', 'public', 'Sign-in', 'M-01'),
  navigationControl('register', 'public', 'Registration', 'M-01'),
];

export const languageControl = {
  id: 'app.nav.language',
  labelKey: 'language',
  helpKey: 'languageHelp',
  command: 'Store app language and update document language',
  permission: 'public',
  prerequisite: 'Browser language preference storage',
  valueSource: 'cr-language (defaults to English)',
  behavior: 'functional',
  owner: 'M-08',
  composition: 'Application navigation',
  unavailable: {
    failure: 'Apply the selection for the current page.',
    empty: 'Use English.',
    locked: 'Available while the vault is locked.',
  },
} as const satisfies ControlContract;

export const themeControl = {
  id: 'app.nav.theme',
  labelKey: 'theme',
  helpKey: 'languageHelp',
  command: 'Switch between light and dark and store the choice',
  permission: 'public',
  prerequisite: 'Account preferences when signed in, cr-theme when signed out',
  valueSource: 'Current data-theme on the page',
  behavior: 'functional',
  owner: 'M-08',
  composition: 'Application navigation',
  unavailable: {
    failure: 'Apply the theme for the current page when storage is blocked.',
    empty: 'Follow the device theme.',
    locked: 'Available while the vault is locked.',
  },
} as const satisfies ControlContract;

export const signOutControl = {
  id: 'app.nav.sign-out',
  labelKey: 'logout',
  helpKey: 'sessionHelp',
  command: 'Lock local content and POST /api/v1/auth/logout',
  permission: 'signed-in',
  prerequisite: 'Account session',
  valueSource: 'Current account session',
  behavior: 'functional',
  owner: 'M-01',
  composition: 'Application navigation',
  unavailable: {
    failure: 'Display the auth error.',
    empty: 'Omit for signed-out visitors.',
    locked: 'Available while the vault is locked.',
  },
} as const satisfies ControlContract;

export const menuControl = {
  id: 'app.nav.menu',
  labelKey: 'menu',
  helpKey: 'account',
  command: 'Keep the menu sidebar open, or hide it until the pointer reaches the left edge',
  permission: 'signed-in',
  prerequisite: 'Top bar',
  valueSource: 'cr-sidebar on this device (pinned by default)',
  behavior: 'functional',
  owner: 'M-08',
  composition: 'Application top bar',
  unavailable: {
    failure: 'The disclosure changes local UI state.',
    empty: 'Show signed-out destinations.',
    locked: 'Available while the vault is locked.',
  },
} as const satisfies ControlContract;

function menuEntry(id: string, labelKey: string, command: string): ControlContract {
  return {
    id,
    labelKey,
    helpKey: 'accountMenu',
    command,
    permission: 'signed-in',
    prerequisite: 'Account menu open',
    valueSource: 'Account preferences, app language and current route',
    behavior: 'functional',
    owner: 'M-08',
    composition: 'Account menu',
    unavailable: {
      failure: 'Apply the choice for the current page when storage is blocked.',
      empty: 'Omit for signed-out visitors.',
      locked: 'Available while the vault is locked.',
    },
  };
}

/** The round photo in the top bar and its menu. Sign out reuses `signOutControl`. */
export const accountMenuControls = [
  menuEntry('app.nav.account-menu', 'accountMenu', 'Open or close the account menu'),
  menuEntry('app.menu.theme', 'themeMenu', 'Open the theme choices'),
  menuEntry('app.menu.theme.light', 'light', 'Use the light theme on this account and device'),
  menuEntry('app.menu.theme.dark', 'dark', 'Use the dark theme on this account and device'),
  menuEntry('app.menu.theme.system', 'system', 'Follow the device theme'),
  menuEntry('app.menu.language', 'languageMenu', 'Open the language choices'),
  menuEntry('app.menu.language.en', 'language', 'Use English for the interface'),
  menuEntry('app.menu.language.hu', 'language', 'Use Hungarian for the interface'),
  menuEntry('app.menu.profile', 'profileTab', 'GET /settings/account'),
];
