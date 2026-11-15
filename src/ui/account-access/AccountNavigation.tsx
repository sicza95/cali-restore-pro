import { createSignal, For, Show } from 'solid-js';
import { useApp } from '../app-context/AppContext';
import { Icon } from '../icon/Icon';
import type { IconName } from '../icon/types';
import { accountPaths } from '../router/constants';
import { navigationText } from './navigation-copy';
import {
  accountNavigationControls,
  languageControl,
  menuControl,
  signOutControl,
} from './navigation-controls';

const destinationIcons: Record<(typeof accountNavigationControls)[number]['labelKey'], IconName> = {
  projects: 'folder',
  invitations: 'envelope',
  profile: 'account',
  security: 'lock',
  preferences: 'settings',
  unlock: 'lock',
  'devices/approve': 'check',
  offline: 'photo',
  admin: 'layers',
  login: 'account',
  register: 'plus',
  libraries: 'layers',
};

export function AccountNavigation() {
  const app = useApp();
  const [expanded, setExpanded] = createSignal(false);
  const c = () => navigationText(app.lang());
  const links = () =>
    accountNavigationControls.filter(({ labelKey }) => {
      if (labelKey === 'login' || labelKey === 'register') return !app.account();
      if (labelKey === 'admin') return !!app.account() && app.canAdmin();
      return !!app.account();
    });
  return (
    <aside class="account-nav">
      <a class="product-name" href={app.account() ? accountPaths.projects : '/'}>
        <Icon name="brand" size={26} />
        <span>
          CaliRestore <strong>Pro</strong>
        </span>
      </a>
      <button
        class="secondary account-nav-toggle"
        data-control-id={menuControl.id}
        aria-controls="app-navigation"
        aria-expanded={expanded()}
        onClick={() => setExpanded(!expanded())}
      >
        <Icon name={expanded() ? 'close' : 'menu'} size={18} />
        {c().menu}
      </button>
      <nav id="app-navigation" aria-label={c().account} data-expanded={expanded()}>
        <For each={links()}>
          {(control) => (
            <a
              href={control.href}
              data-control-id={control.id}
              aria-current={app.router.route().name === control.labelKey ? 'page' : undefined}
            >
              <Icon name={destinationIcons[control.labelKey]} size={18} />
              {c()[control.labelKey]}
            </a>
          )}
        </For>
        <Show when={app.account()}>
          <button
            class="secondary account-sign-out"
            data-control-id={signOutControl.id}
            disabled={app.busy()}
            onClick={() => app.signOut()}
          >
            <Icon name="exit" size={18} />
            {c().logout}
          </button>
        </Show>
      </nav>
      <label class="language">
        {c().language}
        <select
          data-control-id={languageControl.id}
          value={app.lang()}
          aria-describedby="app-language-help"
          onChange={(e) => app.selectLanguage(e.currentTarget.value === 'hu' ? 'hu' : 'en')}
        >
          <option value="en">English</option>
          <option value="hu">Magyar</option>
        </select>
      </label>
      <span class="account-visually-hidden" id="app-language-help">
        {c().languageHelp}
      </span>
    </aside>
  );
}
