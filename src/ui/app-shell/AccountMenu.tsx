import { createEffect, createSignal, For, on, onCleanup, Show } from 'solid-js';
import { navigationText } from '../account-access/navigation-copy';
import { signOutControl } from '../account-access/navigation-controls';
import { languageNames, languages } from '../../platform/i18n/language';
import { useApp } from '../app-context/AppContext';
import { Icon } from '../icon/Icon';
import { ProfileAvatar } from '../account/profile-fields/ProfileFields';
import { accountPaths } from '../router/constants';
import { followLink } from '../router/routes';
import {
  chooseTheme,
  themeChangeEvent,
  themeChoice,
  type ThemeChoice,
} from '../settings/preferences/utils';

const themes: ThemeChoice[] = ['light', 'dark', 'system'];
type Submenu = 'theme' | 'language';

/**
 * The round photo at the right of the top bar. Its menu holds the theme and language (each a
 * submenu that opens in place), the profile and signing out.
 */
export function AccountMenu() {
  const app = useApp();
  const c = () => navigationText(app.lang());
  const [open, setOpen] = createSignal(false);
  const [submenu, setSubmenu] = createSignal<Submenu>();
  const [theme, setTheme] = createSignal(themeChoice(app.account()?.id));
  let button: HTMLButtonElement | undefined;
  let menu: HTMLDivElement | undefined;
  const follow = () => setTheme(themeChoice(app.account()?.id));
  window.addEventListener(themeChangeEvent, follow);
  onCleanup(() => window.removeEventListener(themeChangeEvent, follow));
  createEffect(on(() => app.account()?.id, follow));
  const items = () =>
    [...(menu?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? [])].filter(
      (item) => !(item as HTMLButtonElement).disabled,
    );
  const close = (focusButton = false) => {
    setOpen(false);
    setSubmenu(undefined);
    if (focusButton) button?.focus({ preventScroll: true });
  };
  const toggle = () => {
    if (open()) return close();
    setOpen(true);
    queueMicrotask(() => items()[0]?.focus({ preventScroll: true }));
  };
  // A click anywhere else closes the menu; so does moving to another page.
  const outside = (event: PointerEvent) => {
    const target = event.target as Node;
    if (open() && !menu?.contains(target) && !button?.contains(target)) close();
  };
  document.addEventListener('pointerdown', outside);
  onCleanup(() => document.removeEventListener('pointerdown', outside));
  createEffect(on(app.router.route, () => close(), { defer: true }));
  const keys = (event: KeyboardEvent) => {
    const list = items();
    const at = list.indexOf(document.activeElement as HTMLElement);
    const move = (index: number) =>
      list[(index + list.length) % list.length]?.focus({ preventScroll: true });
    if (event.key === 'Escape') close(true);
    else if (event.key === 'ArrowDown') move(at + 1);
    else if (event.key === 'ArrowUp') move(at - 1);
    else if (event.key === 'Home') move(0);
    else if (event.key === 'End') move(list.length - 1);
    else if (event.key === 'Tab') close();
    else return;
    if (event.key !== 'Tab') event.preventDefault();
  };
  const themeLabel = (value: ThemeChoice) => (value === 'system' ? c().system : c()[value]);
  const Parent = (props: { kind: Submenu; icon: 'sun' | 'moon' | 'globe'; value: string }) => (
    <button
      type="button"
      role="menuitem"
      class="account-menu-item"
      aria-haspopup="true"
      aria-expanded={submenu() === props.kind}
      data-control-id={`app.menu.${props.kind}`}
      onClick={() => setSubmenu(submenu() === props.kind ? undefined : props.kind)}
    >
      <Icon name={props.icon} size={18} />
      <span>{props.kind === 'theme' ? c().themeMenu : c().languageMenu}</span>
      <span class="account-menu-value">{props.value}</span>
      <Icon name="chevron" size={14} class="account-menu-chevron" />
    </button>
  );
  const Choice = (props: { id: string; checked: boolean; label: string; pick: () => void }) => (
    <button
      type="button"
      role="menuitemradio"
      class="account-menu-item account-menu-choice"
      aria-checked={props.checked}
      data-control-id={props.id}
      onClick={() => {
        props.pick();
        // The choices close with their submenu; focus goes back to the item that opened it.
        const parent = submenu();
        setSubmenu(undefined);
        menu
          ?.querySelector<HTMLElement>(`[data-control-id="app.menu.${parent}"]`)
          ?.focus({ preventScroll: true });
      }}
    >
      <span class="account-menu-check">
        <Show when={props.checked}>
          <Icon name="check" size={16} />
        </Show>
      </span>
      <span>{props.label}</span>
    </button>
  );
  return (
    <Show when={app.account()}>
      {(account) => (
        <div class="account-menu">
          <button
            ref={(el) => (button = el)}
            type="button"
            class="account-menu-button"
            data-control-id="app.nav.account-menu"
            aria-haspopup="menu"
            aria-expanded={open()}
            aria-controls={open() ? 'account-menu' : undefined}
            // The visible initial belongs in the name too: "Account menu, Anna Kovács".
            aria-label={`${c().accountMenu}, ${account().name || account().email}`}
            title={account().name || account().email}
            onClick={toggle}
          >
            <ProfileAvatar name={account().name} email={account().email} photo={account().photo} />
          </button>
          <Show when={open()}>
            <div
              ref={(el) => (menu = el)}
              id="account-menu"
              class="account-menu-panel"
              role="menu"
              aria-label={c().accountMenu}
              onKeyDown={keys}
            >
              <div class="account-menu-who" role="none">
                <ProfileAvatar
                  name={account().name}
                  email={account().email}
                  photo={account().photo}
                  size="large"
                />
                <Show when={account().name}>
                  <strong>{account().name}</strong>
                </Show>
                <span>{account().email}</span>
              </div>
              <div class="account-menu-group" role="none">
                <Parent
                  kind="theme"
                  icon={theme() === 'dark' ? 'moon' : 'sun'}
                  value={themeLabel(theme())}
                />
                <Show when={submenu() === 'theme'}>
                  <div class="account-menu-sub" role="group" aria-label={c().themeMenu}>
                    <For each={themes}>
                      {(value) => (
                        <Choice
                          id={`app.menu.theme.${value}`}
                          checked={theme() === value}
                          label={themeLabel(value)}
                          pick={() => chooseTheme(account().id, value)}
                        />
                      )}
                    </For>
                  </div>
                </Show>
                <Parent kind="language" icon="globe" value={languageNames[app.lang()]} />
                <Show when={submenu() === 'language'}>
                  <div class="account-menu-sub" role="group" aria-label={c().languageMenu}>
                    <For each={languages}>
                      {(code) => (
                        <Choice
                          id={`app.menu.language.${code}`}
                          checked={app.lang() === code}
                          label={languageNames[code]}
                          pick={() => app.selectLanguage(code)}
                        />
                      )}
                    </For>
                  </div>
                </Show>
              </div>
              <div class="account-menu-group" role="none">
                <a
                  role="menuitem"
                  class="account-menu-item"
                  href={accountPaths.profile}
                  data-control-id="app.menu.profile"
                  onClick={(event) => {
                    followLink(event, app.router.navigate);
                    close();
                  }}
                >
                  <Icon name="account" size={18} />
                  <span>{app.t('profileTab')}</span>
                </a>
                <button
                  type="button"
                  role="menuitem"
                  class="account-menu-item"
                  data-control-id={signOutControl.id}
                  disabled={app.busy()}
                  onClick={() => {
                    close();
                    void app.signOut();
                  }}
                >
                  <Icon name="exit" size={18} />
                  <span>{c().logout}</span>
                </button>
              </div>
            </div>
          </Show>
        </div>
      )}
    </Show>
  );
}
