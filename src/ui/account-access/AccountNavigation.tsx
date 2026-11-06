import { createSignal, For, Show } from 'solid-js';
import type { createAccountAccess } from './createAccountAccess';
import { accountDestinations } from './routes';
import { navigationText } from './navigation-copy';
import {
  accountNavigationControls,
  languageControl,
  menuControl,
  signOutControl,
} from './navigation-controls';

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
      <a class="product-name" href={props.model.account() ? accountDestinations.projects : '/'}>
        <svg viewBox="0 0 32 32" width="24" height="24" aria-hidden="true">
          <path
            d="M25 8a11 11 0 1 0 0 16"
            fill="none"
            stroke="currentColor"
            stroke-width="4"
            stroke-linecap="round"
          />
        </svg>
        CaliRestore Pro
      </a>
      <button
        class="secondary account-nav-toggle"
        data-control-id={menuControl.id}
        aria-controls="app-navigation"
        aria-expanded={expanded()}
        onClick={() => setExpanded(!expanded())}
      >
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
              {c()[control.labelKey]}
            </a>
          )}
        </For>
        <Show when={props.model.account()}>
          <button
            class="secondary"
            data-control-id={signOutControl.id}
            disabled={props.model.busy()}
            onClick={() => props.model.signOut()}
          >
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
