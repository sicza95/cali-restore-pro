import { Admin } from './settings/admin/Admin';
import { Preferences } from './settings/preferences/Preferences';
import { Profile } from './settings/profile/Profile';
import { settingsCopy } from './settings/constants';
import './settings/styles.css';
import { Match, Show, Switch } from 'solid-js';
import { AccessForm } from './access-form/AccessForm';
import { AccountSecurity } from './account-security/AccountSecurity';
import { createAccountAccess } from './createAccountAccess';
import type { Language } from './types';
import { VaultSection } from './account-security/VaultSection';
import { ProjectWorkspace } from './projects/ProjectWorkspace';
import { pinCopy } from './invitations/OfflineOriginals';
import { InvitationInbox } from './invitations/InvitationInbox';

export function AccountAccess() {
  const model = createAccountAccess();
  const {
    account,
    busy,
    connection,
    failed,
    lang,
    linkToken,
    message,
    refreshConnection,
    selectLanguage,
    signOut,
    submit,
    t,
    view,
  } = model;
  const c = () => settingsCopy[lang()];
  const admin = () => model.can('accounts.view') || model.can('operations.view');
  return (
    <div class="account-shell">
      <aside class="account-nav">
        <a class="product-name" href="/">
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
        <p>{t('account')}</p>
        <nav aria-label={t('account')}>
          <Show
            when={account()}
            fallback={
              <>
                <a href="/login" aria-current={view === 'login' ? 'page' : undefined}>
                  {t('login')}
                </a>
                <a href="/register" aria-current={view === 'register' ? 'page' : undefined}>
                  {t('register')}
                </a>
              </>
            }
          >
            <a href="/projects" aria-current={view === 'projects' ? 'page' : undefined}>
              {t('projects')}
            </a>
            <a href="/invitations" aria-current={view === 'invitations' ? 'page' : undefined}>
              {t('invitations')}
            </a>
            <a href="/offline-originals">{pinCopy[lang()].heading}</a>
            <a href="/settings/account" aria-current={view === 'profile' ? 'page' : undefined}>
              {c().profile}
            </a>
            <a
              href="/settings/preferences"
              aria-current={view === 'preferences' ? 'page' : undefined}
            >
              {c().preferences}
            </a>
            <Show when={admin()}>
              <a href="/admin" aria-current={view === 'admin' ? 'page' : undefined}>
                {c().admin}
              </a>
            </Show>
            <a href="/settings/security" aria-current={view === 'security' ? 'page' : undefined}>
              {t('security')}
            </a>
            <button class="secondary" disabled={busy()} onClick={signOut}>
              {t('logout')}
            </button>
          </Show>
        </nav>
        <label class="language">
          Language / Nyelv
          <select
            value={lang()}
            onChange={(e) => selectLanguage(e.currentTarget.value as Language)}
          >
            <option value="en">English</option>
            <option value="hu">Magyar</option>
          </select>
        </label>
      </aside>
      <main class="account-content">
        <h1>
          {view === 'profile' || view === 'preferences' || view === 'admin' ? c()[view] : t(view)}
        </h1>
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
                <a href="/recover-deleted-account">{t('recover-deleted-account')}</a>
              </p>
            );
          }}
        </Show>
        <Switch
          fallback={
            <AccessForm
              view={view as Parameters<typeof AccessForm>[0]['view']}
              linkToken={linkToken}
              submit={submit}
              t={t}
              busy={busy}
            />
          }
        >
          <Match
            when={
              view === 'profile' ||
              view === 'preferences' ||
              view === 'admin' ||
              view === 'projects' ||
              view === 'invitations' ||
              view === 'security'
            }
          >
            <Show when={model.loaded()} fallback={<p role="status">{t('working')}</p>}>
              <Show
                when={account()}
                fallback={
                  <p>
                    {t('signedOut')}{' '}
                    <a href={view === 'invitations' ? '/login?next=invitations' : '/login'}>
                      {t('login')}
                    </a>
                  </p>
                }
              >
                <Switch>
                  <Match when={view === 'profile'}>
                    <Profile model={model} />
                  </Match>
                  <Match when={view === 'preferences'}>
                    <Preferences model={model} />
                  </Match>
                  <Match when={view === 'admin'}>
                    <Admin model={model} />
                  </Match>
                  <Match when={view === 'security'}>
                    <AccountSecurity model={model} />
                  </Match>
                  <Match when={view === 'invitations'}>
                    <Show when={account()} keyed>
                      {(current) => (
                        <VaultSection
                          account={current.id}
                          language={lang()}
                          workspace={(vault) => <InvitationInbox model={model} vault={vault} />}
                        />
                      )}
                    </Show>
                  </Match>
                  <Match when={view === 'projects' && account()}>
                    {(current) => (
                      <VaultSection
                        account={current().id}
                        language={lang()}
                        workspace={(vault) => (
                          <ProjectWorkspace vault={vault} language={lang()} model={model} />
                        )}
                      />
                    )}
                  </Match>
                </Switch>
              </Show>
            </Show>
          </Match>
        </Switch>
        <footer>
          <p>{t('upcoming')}</p>
          <section aria-label={t('platform')}>
            <span role="status">{t(connection())}</span>
            <button
              class="secondary"
              disabled={connection() === 'checking'}
              onClick={() => void refreshConnection()}
            >
              {t('check')}
            </button>
          </section>
        </footer>
      </main>
    </div>
  );
}
