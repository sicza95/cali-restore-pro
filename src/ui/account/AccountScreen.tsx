import { Match, Switch } from 'solid-js';
import { lazyView } from '../shared/lazyView';
import { useApp } from '../app-context/AppContext';
import type { AccountDestination } from '../router/types';
import { VaultSection } from './account-security/VaultSection';
import { ProjectWorkspace } from '../projects/ProjectWorkspace';

// Rarely opened screens load on demand; the offline worker precaches every chunk.
const AccountSecurity = lazyView(() =>
  import('./account-security/AccountSecurity').then((m) => m.AccountSecurity),
).View;
const InvitationInbox = lazyView(() =>
  import('../sharing/InvitationInbox').then((m) => m.InvitationInbox),
).View;
const Admin = lazyView(() => import('../settings/admin/Admin').then((m) => m.Admin)).View;
const Preferences = lazyView(() =>
  import('../settings/preferences/Preferences').then((m) => m.Preferences),
).View;
const PrivateLibraries = lazyView(() =>
  import('../settings/preferences/PrivateLibraries').then((m) => m.PrivateLibraries),
).View;
const Profile = lazyView(() => import('../settings/profile/Profile').then((m) => m.Profile)).View;

/** The screen of a signed-in destination, rendered once its route guard allows it. */
export function AccountScreen(props: { destination: AccountDestination; account: string }) {
  const { lang } = useApp();
  return (
    <Switch>
      <Match when={props.destination === 'profile'}>
        <Profile />
      </Match>
      <Match when={props.destination === 'preferences'}>
        <Preferences />
      </Match>
      <Match when={props.destination === 'libraries'}>
        <VaultSection
          account={props.account}
          language={lang()}
          workspace={(vault) => <PrivateLibraries vault={vault} language={lang()} />}
        />
      </Match>
      <Match when={props.destination === 'admin'}>
        <Admin />
      </Match>
      <Match when={props.destination === 'security'}>
        <AccountSecurity />
      </Match>
      <Match when={props.destination === 'invitations'}>
        <VaultSection
          account={props.account}
          language={lang()}
          workspace={(vault) => <InvitationInbox vault={vault} />}
        />
      </Match>
      <Match when={props.destination === 'projects'}>
        <VaultSection
          account={props.account}
          language={lang()}
          workspace={(vault) => <ProjectWorkspace vault={vault} language={lang()} />}
        />
      </Match>
    </Switch>
  );
}
