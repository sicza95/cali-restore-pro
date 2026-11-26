import { createEffect, createSignal, For, on, onCleanup, Show } from 'solid-js';
import { navigationText } from '../account-access/navigation-copy';
import {
  accountNavigationControls,
  languageControl,
  menuControl,
} from '../account-access/navigation-controls';
import { languageNames, languages, parseLanguage } from '../../platform/i18n/language';
import { useApp } from '../app-context/AppContext';
import { Icon } from '../icon/Icon';
import { ThemeToggle } from './ThemeToggle';
import { AccountMenu } from './AccountMenu';
import { OrganisationSwitcher } from '../organisations/OrganisationSwitcher';
import { useLiveUpdates } from '../organisations/live-updates';
import { useOrganisations } from '../organisations/organisation-state';
import { organisationCopy } from '../organisations/organisation-copy';
import { setSidebarPinned, sidebarPinned } from './sidebar-state';
import type { IconName } from '../icon/types';
import { accountPaths } from '../router/constants';
import { followLink } from '../router/routes';
import './shell.css';
import './browser-shell.css';

const destinationIcons: Record<(typeof accountNavigationControls)[number]['labelKey'], IconName> = {
  projects: 'folder',
  organisations: 'organisation',
  settings: 'settings',
  invitations: 'envelope',
  profile: 'account',
  security: 'lock',
  preferences: 'settings',
  offline: 'photo',
  admin: 'layers',
  login: 'account',
  register: 'plus',
  libraries: 'shape',
};

/** `app`: signed in, top bar and menu sidebar. `public`: signed-out pages, language and theme. */
export type NavigationMode = 'app' | 'public';

export function AppNavigation(props: { mode: NavigationMode; rail: boolean }) {
  return (
    <Show when={props.mode === 'app'} fallback={<PublicBar />}>
      <AppBar />
      <Sidebar rail={props.rail} />
    </Show>
  );
}

/** Signed-out pages: preferences and a connection retry when unavailable; the card carries the brand. */
function PublicBar() {
  const app = useApp();
  const c = () => navigationText(app.lang());
  return (
    <aside class="account-nav app-nav" data-mode="public">
      <div class="app-nav-prefs">
        <Show when={app.connection() !== 'ready'}>
          <ConnectionStatus />
        </Show>
        <label class="language">
          <span class="account-visually-hidden">{c().language}</span>
          <select
            data-control-id={languageControl.id}
            value={app.lang()}
            aria-describedby="app-language-help"
            onChange={(e) => app.selectLanguage(parseLanguage(e.currentTarget.value))}
          >
            <For each={languages}>
              {(code) => (
                <option value={code} selected={app.lang() === code}>
                  {languageNames[code]}
                </option>
              )}
            </For>
          </select>
        </label>
        <ThemeToggle />
      </div>
      <span class="account-visually-hidden" id="app-language-help">
        {c().languageHelp}
      </span>
    </aside>
  );
}

/** Always visible: the sidebar switch, the product name and the account menu. */
function AppBar() {
  const app = useApp();
  useLiveUpdates();
  const c = () => navigationText(app.lang());
  const label = () => (sidebarPinned() ? c().hideSidebar : c().showSidebar);
  return (
    <header class="app-bar">
      <button
        type="button"
        class="app-bar-icon"
        data-control-id={menuControl.id}
        aria-pressed={sidebarPinned()}
        aria-label={label()}
        title={label()}
        onClick={() => setSidebarPinned(!sidebarPinned())}
      >
        <Icon name="sidebar" size={20} />
      </button>
      <a
        class="product-name"
        href={accountPaths.projects}
        onClick={(event) => followLink(event, app.router.navigate)}
      >
        <Icon name="brand" size={26} />
        <span>
          CaliRestore <strong>Pro</strong>
        </span>
      </a>
      <div class="app-bar-end">
        <ConnectionStatus />
        <OrganisationSwitcher />
        <AccountMenu />
      </div>
    </header>
  );
}

/**
 * The menu sidebar. Pinned, it is a column beside the page (icons only on a surface or a narrow
 * screen). Not pinned, it floats over the page while the pointer is at the left edge or on it.
 */
function Sidebar(props: { rail: boolean }) {
  const app = useApp();
  const c = () => navigationText(app.lang());
  const orgs = useOrganisations();
  const [peek, setPeek] = createSignal(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => clearTimeout(timer));
  createEffect(on(app.router.route, () => setPeek(false), { defer: true }));
  createEffect(on(sidebarPinned, () => setPeek(false), { defer: true }));
  const links = () =>
    accountNavigationControls.filter(({ labelKey }) => {
      if (!app.account() || labelKey === 'login' || labelKey === 'register') return false;
      if (labelKey === 'admin') return app.canAdmin();
      return true;
    });
  const settingsRoutes: readonly string[] = ['profile', 'security', 'preferences'];
  const current = (key: string) => {
    const name = app.router.route().name;
    return key === 'settings' ? settingsRoutes.includes(name) : name === key;
  };
  const Links = (linkProps: { rail: boolean }) => (
    <nav id="app-navigation" class="app-nav-links" aria-label={c().menu}>
      <For each={links()}>
        {(control) => (
          <a
            href={control.href}
            onClick={(event) => followLink(event, app.router.navigate)}
            data-control-id={control.id}
            title={linkProps.rail ? c()[control.labelKey] : undefined}
            aria-current={current(control.labelKey) ? 'page' : undefined}
          >
            <Icon name={destinationIcons[control.labelKey]} size={18} />
            <span class="app-nav-label">{c()[control.labelKey]}</span>
            <Show when={control.labelKey === 'organisations' && orgs.invitations().length}>
              {(count) => (
                <span class="app-nav-badge">
                  <span aria-hidden="true">{count()}</span>
                  <span class="account-visually-hidden">
                    , {organisationCopy[app.lang()].waiting(count())}
                  </span>
                </span>
              )}
            </Show>
          </a>
        )}
      </For>
    </nav>
  );
  return (
    <Show
      when={sidebarPinned()}
      fallback={
        <>
          {/* A short pause at the edge, so passing over it does not open the menu. */}
          <div
            class="app-sidebar-edge"
            aria-hidden="true"
            onPointerEnter={(event) => {
              if (event.pointerType !== 'mouse') return;
              timer = setTimeout(() => setPeek(true), 90);
            }}
            onPointerLeave={() => clearTimeout(timer)}
          />
          <Show when={peek()}>
            <aside
              class="app-sidebar"
              data-floating=""
              onPointerLeave={(event) => {
                if (event.pointerType === 'mouse') setPeek(false);
              }}
              onKeyDown={(event) => event.key === 'Escape' && setPeek(false)}
            >
              <Links rail={false} />
            </aside>
          </Show>
        </>
      }
    >
      <aside class="app-sidebar" data-rail={props.rail ? '' : undefined}>
        <Links rail={props.rail} />
      </aside>
    </Show>
  );
}

/** The status itself retries connectivity; sign-in shows it only while unavailable/checking. */
function ConnectionStatus() {
  const app = useApp();
  return (
    <button
      type="button"
      class="app-connection"
      data-control-id="app.service.retry"
      data-state={app.connection()}
      disabled={app.connection() === 'checking'}
      aria-label={app.t(app.connection())}
      title={app.t('check')}
      onClick={() => void app.refreshConnection()}
    >
      <span role="status">{app.t(app.connection())}</span>
    </button>
  );
}
