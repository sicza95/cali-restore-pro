import { Match, Show, Switch } from 'solid-js';
import { AppProvider, useApp } from '../app-context/AppContext';
import { AppNavigation } from '../app-shell/AppNavigation';
import type { NavigationMode } from '../app-shell/AppNavigation';
import { PageHeading } from '../app-shell/PageHeading';
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
  const mode = (): NavigationMode => {
    if (publicView()) return 'public';
    if (compact()) return 'compact';
    return surface() ? 'rail' : 'sidebar';
  };
  return (
    <div
      class="account-shell"
      classList={{ 'account-shell--public': !!publicView() }}
      data-nav={mode()}
      data-surface={surface() || undefined}
    >
      <AppNavigation mode={mode()} />
      <main class="account-content">
        <Show when={!publicView()}>
          <PageHeading />
        </Show>
        <Show when={message()}>
          {(key) => (
            <p class="account-message" role={failed() ? 'alert' : 'status'} data-error={failed()}>
              {t(key())}
            </p>
          )}
        </Show>
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
        <footer class="account-footer">
          <section aria-label={t('platform')}>
            <span class="account-connection" data-state={connection()} role="status">
              {t(connection())}
            </span>
            <button
              data-control-id="app.service.retry"
              disabled={connection() === 'checking'}
              onClick={() => void app.refreshConnection()}
            >
              {t('check')}
            </button>
          </section>
        </footer>
      </main>
    </div>
  );
}
