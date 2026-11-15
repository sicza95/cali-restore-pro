import { Match, Switch } from 'solid-js';
import { useApp } from '../app-context/AppContext';
import { accountPaths } from '../router/constants';
import type { AccountDestination } from '../router/types';
import { AccountSecurity } from './account-security/AccountSecurity';
import { VaultSection } from './account-security/VaultSection';
import { InvitationInbox } from '../sharing/InvitationInbox';
import { navigationText } from '../account-access/navigation-copy';
import { ProjectWorkspace } from '../projects/ProjectWorkspace';
import { Admin } from '../settings/admin/Admin';
import { Preferences } from '../settings/preferences/Preferences';
import { PrivateLibraries } from '../settings/preferences/PrivateLibraries';
import { Profile } from '../settings/profile/Profile';

/** The screen of a signed-in destination, rendered once its route guard allows it. */
export function AccountScreen(props: { destination: AccountDestination; account: string }) {
  const { lang } = useApp();
  const c = () => navigationText(lang());
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
      <Match when={props.destination === 'unlock' || props.destination === 'devices/approve'}>
        <VaultSection
          account={props.account}
          language={lang()}
          entry={props.destination === 'unlock' ? 'unlock' : 'approve'}
          unlockOnly={props.destination === 'unlock' ? c().unlockHelp : c().approvalHelp}
          setupLink={{ href: accountPaths.security, text: c().vaultSetup }}
        />
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
