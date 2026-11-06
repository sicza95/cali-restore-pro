import type { ControlContract } from '../control-registry/types';
import { accountDestinations } from './routes';

const destinations = {
  ...accountDestinations,
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
  navigationControl('profile', 'signed-in', 'Account profile', 'M-02'),
  navigationControl('security', 'signed-in', 'Account security', 'M-02'),
  navigationControl('preferences', 'signed-in', 'Local account preferences', 'M-02'),
  navigationControl('unlock', 'signed-in', 'Local vault unlock requires local vault', 'M-03'),
  navigationControl(
    'devices/approve',
    'signed-in',
    'Device approval requires unlocked vault for approval',
    'M-03',
  ),
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
  command: 'Expand or collapse navigation',
  permission: 'public',
  prerequisite: 'Phone layout',
  valueSource: 'Current menu disclosure state',
  behavior: 'functional',
  owner: 'M-08',
  composition: 'Phone application navigation',
  unavailable: {
    failure: 'The disclosure changes local UI state.',
    empty: 'Show signed-out destinations.',
    locked: 'Available while the vault is locked.',
  },
} as const satisfies ControlContract;
