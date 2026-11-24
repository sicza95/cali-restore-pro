import { createEffect, createSignal, For, on, onCleanup, Show } from 'solid-js';
import { useApp } from '../app-context/AppContext';
import { Icon } from '../icon/Icon';
import { accountPaths } from '../router/constants';
import { followLink } from '../router/routes';
import { organisationCopy } from './organisation-copy';
import { useOrganisations } from './organisation-state';
import type { OrganisationSummary } from '../../platform/api';

export const organisationLabel = (
  entry: Pick<OrganisationSummary, 'name' | 'personal'>,
  personal: string,
) => (entry.personal ? personal : entry.name);

/**
 * The current organisation, in the top bar before the account. It reads as a link; choosing it
 * opens a menu of the account's organisations and a way to manage them.
 */
export function OrganisationSwitcher() {
  const app = useApp();
  const orgs = useOrganisations();
  const c = () => organisationCopy[app.lang()];
  const [open, setOpen] = createSignal(false);
  let button: HTMLButtonElement | undefined;
  let menu: HTMLDivElement | undefined;
  const items = () => [...(menu?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? [])];
  const close = (focusButton = false) => {
    setOpen(false);
    if (focusButton) button?.focus({ preventScroll: true });
  };
  const toggle = () => {
    if (open()) return close();
    void orgs.refresh();
    setOpen(true);
    queueMicrotask(() => {
      const list = items();
      (list.find((item) => item.getAttribute('aria-checked') === 'true') ?? list[0])?.focus({
        preventScroll: true,
      });
    });
  };
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
  const pick = (entry: OrganisationSummary) => {
    orgs.select(entry.id);
    close(true);
    // A project page belongs to the organisation it was opened in; go back to the list.
    const route = app.router.route();
    if (route.name === 'projects' && route.project) app.router.navigate(accountPaths.projects);
  };
  return (
    <Show when={orgs.selected()}>
      {(current) => (
        <div class="org-switcher">
          <button
            ref={(el) => (button = el)}
            type="button"
            class="org-switcher-button"
            data-control-id="app.nav.organisation"
            aria-haspopup="menu"
            aria-expanded={open()}
            aria-controls={open() ? 'organisation-menu' : undefined}
            aria-label={c().switchTo(organisationLabel(current(), c().personal))}
            onClick={toggle}
          >
            <span class="org-switcher-name">{organisationLabel(current(), c().personal)}</span>
            <Icon name="chevron" size={12} class="org-switcher-chevron" />
          </button>
          <Show when={open()}>
            <div
              ref={(el) => (menu = el)}
              id="organisation-menu"
              class="account-menu-panel org-switcher-panel"
              role="menu"
              aria-label={c().switchLabel}
              onKeyDown={keys}
            >
              <div class="account-menu-group" role="none">
                <For each={orgs.list()}>
                  {(entry) => (
                    <button
                      type="button"
                      role="menuitemradio"
                      class="account-menu-item account-menu-choice"
                      aria-checked={entry.id === current().id}
                      data-control-id="app.nav.organisation.choice"
                      onClick={() => pick(entry)}
                    >
                      <span class="account-menu-check">
                        <Show when={entry.id === current().id}>
                          <Icon name="check" size={16} />
                        </Show>
                      </span>
                      <span>{organisationLabel(entry, c().personal)}</span>
                    </button>
                  )}
                </For>
              </div>
              <div class="account-menu-group" role="none">
                <a
                  role="menuitem"
                  class="account-menu-item"
                  href={accountPaths.organisations}
                  data-control-id="app.nav.organisation.manage"
                  onClick={(event) => {
                    followLink(event, app.router.navigate);
                    close();
                  }}
                >
                  <Icon name="organisation" size={18} />
                  <span>{c().manage}</span>
                </a>
              </div>
            </div>
          </Show>
        </div>
      )}
    </Show>
  );
}
