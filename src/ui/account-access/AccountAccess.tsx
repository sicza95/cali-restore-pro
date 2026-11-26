import { Match, Show, Switch } from 'solid-js';
import { AppProvider, useApp } from '../app-context/AppContext';
import { AppNavigation } from '../app-shell/AppNavigation';
import type { NavigationMode } from '../app-shell/AppNavigation';
import { PageHeading } from '../app-shell/PageHeading';
import { Toast } from '../app-shell/Toast';
import { ConfirmIdentity } from '../app-shell/ConfirmIdentity';
import { sidebarPinned } from '../app-shell/sidebar-state';
import { useCompactLayout } from '../app-shell/useCompactLayout';
import { accountPaths } from '../router/constants';
import { routeGuard } from '../router/guard';
import { isAccountDestination, signInLink } from '../router/routes';
import { AccessForm } from '../account/access-form/AccessForm';
import { AccountScreen } from '../account/AccountScreen';
import { navigationText } from './navigation-copy';
import { settingsCopy } from '../settings/settings-copy';
import { deletionCopy } from '../settings/profile/deletion-copy';
import { createRouter } from '../router/createRouter';
import { OfflineOriginalsPage } from '../sharing/OfflineOriginalsPage';
import '../settings/styles.css';
import '../account/access-form/styles.css';

export function AccountAccess() {
  const router = createRouter();
  return (
    <Show when={router.route().name !== 'offline'} fallback={<OfflineOriginalsPage />}>
      <AppProvider router={router}>
        <AccountShell />
      </AppProvider>
    </Show>
  );
}

function AccountShell() {
  const app = useApp();
  const { account, busy, connection, failed, lang, message, submit, t, router } = app;
  const c = () => navigationText(lang());
  const view = () => router.route().name;
  const protectedView = () => {
    const name = view();
    return isAccountDestination(name) ? name : undefined;
  };
  const publicView = () => {
    const name = view();
    return !isAccountDestination(name) && name !== 'notFound' && name !== 'offline'
      ? name
      : undefined;
  };
  const guard = () =>
    routeGuard(view(), {
      loaded: app.loaded(),
      signedIn: !!account()?.id,
      unavailable: app.sessionUnavailable(),
      canAdmin: app.canAdmin(),
    });
  const compact = useCompactLayout();
  const surface = () => {
    const route = router.route();
    return route.name === 'projects' && !!route.surface;
  };
  const browsing = () => {
    const route = router.route();
    return route.name === 'projects' && !route.surface && !route.review;
  };
  const mode = (): NavigationMode => (publicView() ? 'public' : 'app');
  // A pinned sidebar shows icons only on a surface (the canvas keeps its width) or a narrow screen.
  const rail = () => compact() || surface();
  const sidebar = () => (!sidebarPinned() ? 'hidden' : rail() ? 'rail' : 'full');
  return (
    <div
      class="account-shell"
      classList={{ 'account-shell--public': !!publicView() }}
      data-nav={mode()}
      data-sidebar={mode() === 'app' ? sidebar() : undefined}
      data-surface={surface() || undefined}
      data-browser={mode() === 'app' && browsing() ? '' : undefined}
    >
      <AppNavigation mode={mode()} rail={rail()} />
      <Show when={mode() === 'app'}>
        <ConfirmIdentity />
      </Show>
      <main class="account-content">
        <div class="account-page">
          <Show when={!publicView()}>
            <PageHeading />
          </Show>
          {/* Messages float above the page, so they never push the content (or the sign-in card). */}
          <div class="toast-region">
            <Show when={message()} keyed>
              {(key) => (
                <Toast
                  text={typeof key === 'string' ? t(key) : key.text}
                  error={failed()}
                  closeLabel={t('closeMessage')}
                  dismiss={app.dismissMessage}
                />
              )}
            </Show>
          </div>
          <Show when={app.deletionReceipt()}>
            {(receipt) => {
              const date = (iso: string) =>
                new Intl.DateTimeFormat(lang(), { dateStyle: 'long', timeStyle: 'short' }).format(
                  new Date(iso),
                );
              return (
                <p role="status">
                  {deletionCopy[lang()].recoverUntil} {date(receipt().recoverUntil)}.{' '}
                  {deletionCopy[lang()].backupsExpire} {date(receipt().backupExpiresAt)}.{' '}
                  <Show when={view() !== 'admin'}>
                    <a href="/recover-deleted-account">{t('recover-deleted-account')}</a>
                  </Show>
                </p>
              );
            }}
          </Show>
          <Switch>
            <Match when={publicView()}>
              {(form) => (
                <Show when={router.href()} keyed>
                  <AccessForm
                    view={form()}
                    language={lang()}
                    linkToken={router.linkToken()}
                    submit={submit}
                    t={t}
                    busy={busy}
                    passkeySignIn={app.signInWithPasskey}
                  />
                </Show>
              )}
            </Match>
            <Match when={view() === 'notFound'}>
              <a href={account() ? accountPaths.projects : '/login'}>
                {account() ? c().backToProjects : t('login')}
              </a>
            </Match>
            <Match when={protectedView()}>
              {(destination) => (
                <Switch>
                  <Match when={guard() === 'loading'}>
                    <p role="status">{t('working')}</p>
                  </Match>
                  <Match when={guard() === 'retry'}>
                    <button data-control-id="app.session.retry" onClick={() => location.reload()}>
                      {c().retryAccess}
                    </button>
                  </Match>
                  <Match when={guard() === 'signIn'}>
                    <p>
                      {t('signedOut')}{' '}
                      <a href={signInLink(destination(), location.pathname)}>{t('login')}</a>
                    </p>
                  </Match>
                  <Match when={guard() === 'forbidden'}>
                    <p>{settingsCopy[lang()].noAccess}</p>
                  </Match>
                  <Match when={account()?.id} keyed>
                    {(id) => <AccountScreen destination={destination()} account={id} />}
                  </Match>
                </Switch>
              )}
            </Match>
          </Switch>
          <Show when={publicView() && connection() === 'ready'}>
            <span class="account-visually-hidden" role="status">
              {t(connection())}
            </span>
          </Show>
        </div>
      </main>
    </div>
  );
}
