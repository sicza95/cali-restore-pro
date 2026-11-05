import { For, Show } from 'solid-js';
import { VaultSection } from './VaultSection';
import { ConfirmField } from '../confirm-field/ConfirmField';
import { EmailField } from '../email-field/EmailField';
import { PasswordField } from '../password-field/PasswordField';
import { SubmitButton } from '../submit-button/SubmitButton';
import type { AccountSecurityProps } from './types';

export function AccountSecurity(props: AccountSecurityProps) {
  return (
    <Show
      when={props.model.account()}
      fallback={
        <p>
          {props.model.t('signedOut')} <a href="/login">{props.model.t('login')}</a>
        </p>
      }
    >
      {(owner) => (
        <>
          <p class="account-email">{owner().email}</p>
          <Show when={owner().id} keyed>
            {(id) => <VaultSection account={id} language={props.model.lang()} />}
          </Show>
          <section class="account-section">
            <div>
              <h2>{props.model.t('confirmPassword')}</h2>
              <p>{props.model.t('securityHelp')}</p>
            </div>
            <form
              class="account-panel"
              onSubmit={(e) => props.model.submit(e, 'confirm', 'confirmed')}
            >
              <PasswordField t={props.model.t} kind={'currentPassword'} />
              <SubmitButton t={props.model.t} busy={props.model.busy()} label={'confirmPassword'} />
            </form>
          </section>
          <section class="account-section">
            <div>
              <h2>{props.model.t('changePassword')}</h2>
              <p id="password-help">{props.model.t('passwordHelp')}</p>
            </div>
            <form
              class="account-panel"
              onSubmit={(e) => props.model.submit(e, 'change-password', 'success')}
            >
              <PasswordField t={props.model.t} kind={'newPassword'} />
              <ConfirmField t={props.model.t} />
              <button disabled={props.model.busy() || !props.model.confirmed()}>
                {props.model.t('changePassword')}
              </button>
            </form>
          </section>
          <section class="account-section">
            <div>
              <h2>{props.model.t('changeEmail')}</h2>
              <p>{props.model.t('neutral')}</p>
            </div>
            <form
              class="account-panel"
              onSubmit={(e) => props.model.submit(e, 'change-email', 'neutral')}
            >
              <EmailField t={props.model.t} />
              <ConfirmField t={props.model.t} />
              <button disabled={props.model.busy() || !props.model.confirmed()}>
                {props.model.t('changeEmail')}
              </button>
            </form>
          </section>
          <section class="account-section">
            <div>
              <h2>{props.model.t('sessions')}</h2>
              <p>{props.model.t('sessionHelp')}</p>
              <p>{props.model.t('revokeHelp')}</p>
            </div>
            <div class="account-panel">
              <Show when={props.model.sessionError()}>
                <p role="alert">{props.model.t('sessionFailed')}</p>
              </Show>
              <button
                class="secondary"
                disabled={props.model.busy()}
                onClick={() => void props.model.refreshSessions()}
              >
                {props.model.t('refresh')}
              </button>
              <label class="confirmation">
                <input
                  type="checkbox"
                  checked={props.model.revokeConfirmed()}
                  onChange={(e) => props.model.setRevokeConfirmed(e.currentTarget.checked)}
                />
                {props.model.t('confirmation')}
              </label>
              <ul class="session-list">
                <For each={props.model.sessions()}>
                  {(session) => (
                    <li>
                      <span>
                        <Show when={session.current}>{props.model.t('current')} · </Show>
                        <time datetime={session.createdAt}>
                          {new Date(session.createdAt).toLocaleString(props.model.lang())}
                        </time>
                      </span>
                      <button
                        class="secondary"
                        disabled={
                          props.model.busy() ||
                          !props.model.confirmed() ||
                          !props.model.revokeConfirmed()
                        }
                        onClick={() => void props.model.revokeSession(session)}
                      >
                        {props.model.t('revoke')}
                      </button>
                    </li>
                  )}
                </For>
              </ul>
              <button
                class="secondary"
                disabled={
                  props.model.busy() || !props.model.confirmed() || !props.model.revokeConfirmed()
                }
                onClick={() => void props.model.revokeAll()}
              >
                {props.model.t('revokeAll')}
              </button>
            </div>
          </section>
        </>
      )}
    </Show>
  );
}
