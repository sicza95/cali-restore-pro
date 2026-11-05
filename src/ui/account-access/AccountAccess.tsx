import { Show } from 'solid-js';
import { AccessForm } from './access-form/AccessForm';
import { AccountSecurity } from './account-security/AccountSecurity';
import { createAccountAccess } from './createAccountAccess';
import type { Language } from './types';

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
        <h1>{t(view)}</h1>
        <Show when={message()}>
          {(key) => (
            <p class="account-message" role={failed() ? 'alert' : 'status'} data-error={failed()}>
              {t(key())}
            </p>
          )}
        </Show>
        <Show
          when={view === 'security'}
          fallback={
            <AccessForm view={view} linkToken={linkToken} submit={submit} t={t} busy={busy} />
          }
        >
          <AccountSecurity model={model} />
        </Show>
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
