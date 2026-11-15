import { createSignal, For, Show } from 'solid-js';
import { Icon } from '../icon/Icon';
import type { IconName } from '../icon/types';
import type { createAccountAccess } from './createAccountAccess';
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

export function AccountNavigation(props: { model: ReturnType<typeof createAccountAccess> }) {
  const [expanded, setExpanded] = createSignal(false);
  const c = () => navigationText(props.model.lang());
  const links = () =>
    accountNavigationControls.filter(({ labelKey }) => {
      if (labelKey === 'login' || labelKey === 'register') return !props.model.account();
      if (labelKey === 'admin') return !!props.model.account() && props.model.canAdmin();
      return !!props.model.account();
    });
  return (
    <aside class="account-nav">
      <a class="product-name" href={props.model.account() ? accountPaths.projects : '/'}>
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
              aria-current={props.model.view === control.labelKey ? 'page' : undefined}
            >
              <Icon name={destinationIcons[control.labelKey]} size={18} />
              {c()[control.labelKey]}
            </a>
          )}
        </For>
        <Show when={props.model.account()}>
          <button
            class="secondary account-sign-out"
            data-control-id={signOutControl.id}
            disabled={props.model.busy()}
            onClick={() => props.model.signOut()}
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
          value={props.model.lang()}
          aria-describedby="app-language-help"
          onChange={(e) => props.model.selectLanguage(e.currentTarget.value === 'hu' ? 'hu' : 'en')}
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
