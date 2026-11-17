import { For, Show } from 'solid-js';
import { useApp } from '../../app-context/AppContext';
import { VaultSection } from './VaultSection';
import { PasskeySection } from './PasskeySection';
import { ConfirmField } from '../confirm-field/ConfirmField';
import { EmailField } from '../email-field/EmailField';
import { PasswordField } from '../password-field/PasswordField';
import { SubmitButton } from '../submit-button/SubmitButton';

export function AccountSecurity() {
  const app = useApp();
  return (
    <Show
      when={app.account()}
      fallback={
        <p>
          {app.t('signedOut')} <a href="/login">{app.t('login')}</a>
        </p>
      }
    >
      {(owner) => (
        <>
          <p class="account-email">{owner().email}</p>
          <Show when={owner().id} keyed>
            {(id) => <VaultSection account={id} language={app.lang()} />}
          </Show>
          <section class="account-section">
            <div>
              <h2>{app.t('confirmPassword')}</h2>
              <p>{app.t('securityHelp')}</p>
            </div>
            <form class="account-panel" onSubmit={(e) => app.submit(e, 'confirm', 'confirmed')}>
              <PasswordField t={app.t} kind={'currentPassword'} />
              <SubmitButton
                t={app.t}
                busy={app.busy()}
                label="confirmPassword"
                controlId="account.confirm"
              />
            </form>
          </section>
          <section class="account-section">
            <div>
              <h2>{app.t('changePassword')}</h2>
              <p id="password-help">{app.t('passwordHelp')}</p>
            </div>
            <form
              class="account-panel"
              onSubmit={(e) => app.submit(e, 'change-password', 'success')}
            >
              <PasswordField t={app.t} kind={'newPassword'} />
              <ConfirmField t={app.t} />
              <button
                data-control-id="account.password.change"
                disabled={app.busy() || !app.confirmed()}
              >
                {app.t('changePassword')}
              </button>
            </form>
          </section>
          <section class="account-section">
            <div>
              <h2>{app.t('changeEmail')}</h2>
              <p>{app.t('neutral')}</p>
            </div>
            <form class="account-panel" onSubmit={(e) => app.submit(e, 'change-email', 'neutral')}>
              <EmailField t={app.t} />
              <ConfirmField t={app.t} />
              <button
                data-control-id="account.email.change"
                disabled={app.busy() || !app.confirmed()}
              >
                {app.t('changeEmail')}
              </button>
            </form>
          </section>
          <PasskeySection />
          <section class="account-section">
            <div>
              <h2>{app.t('sessions')}</h2>
              <p>{app.t('sessionHelp')}</p>
              <p>{app.t('revokeHelp')}</p>
            </div>
            <div class="account-panel">
              <Show when={app.sessionError()}>
                <p role="alert">{app.t('sessionFailed')}</p>
              </Show>
              <button
                data-control-id="account.sessions.refresh"
                disabled={app.busy()}
                onClick={() => void app.refreshSessions()}
              >
                {app.t('refresh')}
              </button>
              <label class="confirmation">
                <input
                  type="checkbox"
                  checked={app.revokeConfirmed()}
                  onChange={(e) => app.setRevokeConfirmed(e.currentTarget.checked)}
                />
                {app.t('confirmation')}
              </label>
              <ul class="session-list">
                <For each={app.sessions()}>
                  {(session) => (
                    <li>
                      <span>
                        <Show when={session.current}>{app.t('current')} · </Show>
                        <time datetime={session.createdAt}>
                          {new Date(session.createdAt).toLocaleString(app.lang())}
                        </time>
                      </span>
                      <button
                        data-control-id="account.sessions.revoke"
                        disabled={app.busy() || !app.confirmed() || !app.revokeConfirmed()}
                        onClick={() => void app.revokeSession(session)}
                      >
                        {app.t('revoke')}
                      </button>
                    </li>
                  )}
                </For>
              </ul>
              <button
                data-control-id="account.sessions.revoke-all"
                disabled={app.busy() || !app.confirmed() || !app.revokeConfirmed()}
                onClick={() => void app.revokeAll()}
              >
                {app.t('revokeAll')}
              </button>
            </div>
          </section>
        </>
      )}
    </Show>
  );
}
