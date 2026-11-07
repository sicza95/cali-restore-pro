import { Match, Show, Switch } from 'solid-js';
import { AccessForm } from './access-form/AccessForm';
import { AccountSecurity } from './account-security/AccountSecurity';
import { VaultSection } from './account-security/VaultSection';
import { AccountNavigation } from './AccountNavigation';
import { createAccountAccess } from './createAccountAccess';
import { InvitationInbox } from './invitations/InvitationInbox';
import { navigationText } from './navigation-copy';
import { ProjectWorkspace } from './projects/ProjectWorkspace';
import { accountDestinations, isAccountDestination, signInLink } from './routes';
import { Admin } from './settings/admin/Admin';
import { Preferences } from './settings/preferences/Preferences';
import { PrivateLibraries } from './settings/preferences/PrivateLibraries';
import { Profile } from './settings/profile/Profile';
import './settings/styles.css';

export function AccountAccess() {
  const model = createAccountAccess();
  const { account, busy, connection, failed, lang, linkToken, message, submit, t, view } = model;
  const c = () => navigationText(lang());
  const protectedView = isAccountDestination(view) ? view : undefined;
  const publicView = !isAccountDestination(view) && view !== 'notFound' ? view : undefined;
  return (
    <div class="account-shell">
      <AccountNavigation model={model} />
      <main class="account-content">
        <h1>{c()[view]}</h1>
        <Show when={message()}>
          {(key) => (
            <p class="account-message" role={failed() ? 'alert' : 'status'} data-error={failed()}>
              {t(key())}
            </p>
          )}
        </Show>
        <Show when={model.deletionReceipt()}>
          {(receipt) => {
            const date = (iso: string) =>
              new Intl.DateTimeFormat(lang(), { dateStyle: 'long', timeStyle: 'short' }).format(
                new Date(iso),
              );
            return (
              <p role="status">
                {lang() === 'hu' ? 'Helyreállítási határidő' : 'Live recovery deadline'}{' '}
                {date(receipt().recoverUntil)}.{' '}
                {lang() === 'hu'
                  ? 'Szervermentések lejárata legkésőbb'
                  : 'Operational backups expire by'}{' '}
                {date(receipt().backupExpiresAt)}.{' '}
                <Show when={view !== 'admin'}>
                  <a href="/recover-deleted-account">{t('recover-deleted-account')}</a>
                </Show>
              </p>
            );
          }}
        </Show>
        <Switch>
          <Match when={publicView}>
            {(form) => (
              <AccessForm view={form()} linkToken={linkToken} submit={submit} t={t} busy={busy} />
            )}
          </Match>
          <Match when={view === 'notFound'}>
            <a href={account() ? accountDestinations.projects : '/login'}>
              {account() ? c().backToProjects : t('login')}
            </a>
          </Match>
          <Match when={protectedView}>
            {(destination) => (
              <Show when={model.loaded()} fallback={<p role="status">{t('working')}</p>}>
                <Show
                  when={account()?.id}
                  keyed
                  fallback={
                    <Show
                      when={!model.sessionUnavailable()}
                      fallback={
                        <button
                          data-control-id="app.session.retry"
                          class="secondary"
                          onClick={() => location.reload()}
                        >
                          {c().retryAccess}
                        </button>
                      }
                    >
                      <p>
                        {t('signedOut')}{' '}
                        <a href={signInLink(destination(), location.pathname)}>{t('login')}</a>
                      </p>
                    </Show>
                  }
                >
                  {(id) => (
                    <Switch>
                      <Match when={view === 'profile'}>
                        <Profile model={model} />
                      </Match>
                      <Match when={view === 'preferences'}>
                        <Preferences model={model} />
                      </Match>
                      <Match when={view === 'libraries'}>
                        <VaultSection
                          account={id}
                          language={lang()}
                          workspace={() => <PrivateLibraries language={lang()} />}
                        />
                      </Match>
                      <Match when={view === 'admin'}>
                        <Admin model={model} />
                      </Match>
                      <Match when={view === 'security'}>
                        <AccountSecurity model={model} />
                      </Match>
                      <Match when={view === 'unlock' || view === 'devices/approve'}>
                        <VaultSection
                          account={id}
                          language={lang()}
                          entry={view === 'unlock' ? 'unlock' : 'approve'}
                          unlockOnly={view === 'unlock' ? c().unlockHelp : c().approvalHelp}
                          setupLink={{ href: accountDestinations.security, text: c().vaultSetup }}
                        />
                      </Match>
                      <Match when={view === 'invitations'}>
                        <VaultSection
                          account={id}
                          language={lang()}
                          workspace={(vault) => <InvitationInbox model={model} vault={vault} />}
                        />
                      </Match>
                      <Match when={view === 'projects'}>
                        <VaultSection
                          account={id}
                          language={lang()}
                          workspace={(vault) => (
                            <ProjectWorkspace vault={vault} language={lang()} model={model} />
                          )}
                        />
                      </Match>
                    </Switch>
                  )}
                </Show>
              </Show>
            )}
          </Match>
        </Switch>
        <footer>
          <p>{t('upcoming')}</p>
          <section aria-label={t('platform')}>
            <span role="status">{t(connection())}</span>
            <button
              data-control-id="app.service.retry"
              class="secondary"
              disabled={connection() === 'checking'}
              onClick={() => void model.refreshConnection()}
            >
              {t('check')}
            </button>
          </section>
        </footer>
      </main>
    </div>
  );
}
