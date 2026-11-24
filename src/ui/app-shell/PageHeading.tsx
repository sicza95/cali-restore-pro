import { For, Show } from 'solid-js';
import { navigationText } from '../account-access/navigation-copy';
import { useApp } from '../app-context/AppContext';
import { Icon } from '../icon/Icon';
import type { Crumb } from '../router/breadcrumbs';
import { followLink } from '../router/routes';
import { usePageTrail } from './usePageTrail';

/** Profile, Security and Preferences are sections of one Settings page. */
const settingsPages: string[] = ['profile', 'security', 'preferences'];

/**
 * Control ids of the crumb links, kept from the back links they replace so tests and the control
 * registry still find them.
 */
function crumbControl(crumb: Crumb, current: Crumb) {
  if (crumb.kind === 'route' && crumb.name === 'projects') return 'project.library';
  if (crumb.kind !== 'project') return undefined;
  return current.kind === 'surface' ? 'surface.project' : 'project.review.parent';
}

/**
 * Breadcrumbs from the route table, then the page title: the last step of the trail. A surface's
 * object sits before it as plain text.
 */
export function PageHeading() {
  const app = useApp();
  const page = usePageTrail();
  const parents = () => page.trail().slice(0, -1);
  return (
    <header
      class="app-page-heading"
      classList={{ 'app-page-heading--settings': settingsPages.includes(app.router.route().name) }}
    >
      <Show when={parents().length}>
        <nav class="app-breadcrumbs" aria-label={navigationText(app.lang()).breadcrumbs}>
          <ol>
            <For each={parents()}>
              {(crumb) => (
                <li>
                  <a
                    href={crumb.href}
                    data-control-id={crumbControl(crumb, page.trail().at(-1)!)}
                    onClick={(event) => followLink(event, app.router.navigate)}
                  >
                    {page.label(crumb)}
                  </a>
                  <Icon name="chevron" size={14} />
                </li>
              )}
            </For>
            <Show when={page.object()}>
              {(name) => (
                <li class="app-breadcrumbs-plain">
                  <span>{name()}</span>
                  <Icon name="chevron" size={14} />
                </li>
              )}
            </Show>
            <li aria-current="page">{page.title()}</li>
          </ol>
        </nav>
      </Show>
      <h1 class="app-page-title">
        {settingsPages.includes(app.router.route().name) ? app.t('settings') : page.title()}
      </h1>
    </header>
  );
}
