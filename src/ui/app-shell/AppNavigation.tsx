import { createEffect, createMemo, createSignal, For, on, Show } from 'solid-js';
import { navigationText } from '../account-access/navigation-copy';
import {
  accountNavigationControls,
  languageControl,
  menuControl,
  signOutControl,
} from '../account-access/navigation-controls';
import { languageNames, languages, parseLanguage } from '../../platform/i18n/language';
import { useApp } from '../app-context/AppContext';
import { Icon } from '../icon/Icon';
import type { IconName } from '../icon/types';
import { accountPaths } from '../router/constants';
import { followLink } from '../router/routes';

const destinationIcons: Record<(typeof accountNavigationControls)[number]['labelKey'], IconName> = {
  projects: 'folder',
  invitations: 'envelope',
  profile: 'account',
  security: 'lock',
  preferences: 'settings',
  offline: 'photo',
  admin: 'layers',
  login: 'account',
  register: 'plus',
  libraries: 'layers',
};

/**
 * `sidebar`: landscape. `rail`: landscape on a surface, icons only so the canvas keeps its width.
 * `compact`: portrait header with a Menu button that opens a modal drawer. `public`: signed-out
 * top bar.
 */
export type NavigationMode = 'sidebar' | 'rail' | 'compact' | 'public';

export function AppNavigation(props: { mode: NavigationMode }) {
  const app = useApp();
  const c = () => navigationText(app.lang());
  const rail = () => props.mode === 'rail';
  const [open, setOpen] = createSignal(false);
  const [drawer, setDrawer] = createSignal<HTMLDialogElement>();
  const [menuButton, setMenuButton] = createSignal<HTMLButtonElement>();
  const links = () =>
    accountNavigationControls.filter(({ labelKey }) => {
      if (labelKey === 'login' || labelKey === 'register') return !app.account();
      if (labelKey === 'admin') return !!app.account() && app.canAdmin();
      return !!app.account();
    });
  const close = () => {
    const dialog = drawer();
    if (dialog?.open) dialog.close();
  };
  createEffect(on(app.router.route, close, { defer: true }));
  createEffect(on(() => props.mode, close, { defer: true }));
  // Every in-app navigation rechecks the session and stores a fresh account object. `on` reruns
  // whenever its source does, so compare ids in a memo: only another account (or signing out)
  // closes the drawer, not that recheck finishing while it is open.
  const accountId = createMemo(() => app.account()?.id);
  createEffect(on(accountId, close, { defer: true }));

  // A component, not a shared node: each layout mode renders its own copy.
  const Destinations = () => (
    <nav id="app-navigation" class="app-nav-links" aria-label={c().account}>
      <For each={links()}>
        {(control) => (
          <a
            href={control.href}
            onClick={(event) => followLink(event, app.router.navigate)}
            data-control-id={control.id}
            title={rail() ? c()[control.labelKey] : undefined}
            aria-current={app.router.route().name === control.labelKey ? 'page' : undefined}
          >
            <Icon name={destinationIcons[control.labelKey]} size={18} />
            <span class="app-nav-label">{c()[control.labelKey]}</span>
          </a>
        )}
      </For>
      <Show when={app.account()}>
        <button
          type="button"
          class="app-sign-out"
          data-control-id={signOutControl.id}
          title={rail() ? c().logout : undefined}
          disabled={app.busy()}
          onClick={() => app.signOut()}
        >
          <Icon name="exit" size={18} />
          <span class="app-nav-label">{c().logout}</span>
        </button>
      </Show>
    </nav>
  );

  return (
    <aside class="account-nav app-nav" data-mode={props.mode}>
      <Show when={props.mode === 'compact'}>
        <button
          ref={setMenuButton}
          type="button"
          class="app-menu-button"
          data-control-id={menuControl.id}
          aria-controls="app-drawer"
          aria-expanded={open()}
          aria-haspopup="dialog"
          onClick={() => {
            drawer()?.showModal();
            setOpen(true);
          }}
        >
          <Icon name="menu" size={20} />
          {c().menu}
        </button>
      </Show>
      <a
        class="product-name"
        href={app.account() ? accountPaths.projects : '/'}
        onClick={(event) => followLink(event, app.router.navigate)}
        title={rail() ? 'CaliRestore Pro' : undefined}
      >
        <Icon name="brand" size={26} />
        <span class="app-nav-label">
          CaliRestore <strong>Pro</strong>
        </span>
      </a>
      <Show when={props.mode === 'compact'} fallback={<Destinations />}>
        <dialog
          ref={setDrawer}
          id="app-drawer"
          class="app-drawer"
          aria-labelledby="app-drawer-title"
          onClose={() => {
            setOpen(false);
            menuButton()?.focus();
          }}
          onClick={(event) => {
            // A click on the dialog box itself, not its content, is a click on the backdrop.
            if (event.target === event.currentTarget) close();
          }}
        >
          <div class="app-drawer-body">
            <header>
              <h2 id="app-drawer-title">{c().menu}</h2>
              <button
                type="button"
                class="app-drawer-close"
                aria-label={c().closeMenu}
                onClick={close}
              >
                <Icon name="close" size={20} />
              </button>
            </header>
            <Destinations />
          </div>
        </dialog>
      </Show>
      <label class="language">
        <span class={rail() ? 'account-visually-hidden' : undefined}>{c().language}</span>
        <select
          data-control-id={languageControl.id}
          value={app.lang()}
          aria-describedby="app-language-help"
          onChange={(e) => app.selectLanguage(parseLanguage(e.currentTarget.value))}
        >
          <For each={languages}>
            {(code) => (
              <option value={code} selected={app.lang() === code}>
                {rail() ? code.toUpperCase() : languageNames[code]}
              </option>
            )}
          </For>
        </select>
      </label>
      <span class="account-visually-hidden" id="app-language-help">
        {c().languageHelp}
      </span>
    </aside>
  );
}
