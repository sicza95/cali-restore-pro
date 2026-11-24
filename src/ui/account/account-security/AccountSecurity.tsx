import { For, Show, type JSX } from 'solid-js';
import { useApp } from '../../app-context/AppContext';
import type { IconName } from '../../icon/types';
import type { Message } from '../../account-access/types';
import { SettingsItem } from '../../settings/SettingsItem';
import { PasskeySection } from './PasskeySection';
import { EmailField } from '../email-field/EmailField';
import { PasswordField } from '../password-field/PasswordField';

/** A security row; its summary keeps the `account.security.*` control id. */
function SecurityOption(props: {
  id: string;
  icon: IconName;
  title: Message;
  help: Message;
  children: JSX.Element;
}) {
  const app = useApp();
  return (
    <SettingsItem
      id={props.id}
      group="security"
      icon={props.icon}
      title={app.t(props.title)}
      help={app.t(props.help)}
      control={`account.security.${props.id}`}
    >
      {props.children}
    </SettingsItem>
  );
}

/**
 * The Security section: what the person can change, in order. Nothing asks for the password up front;
 * a change the server wants confirmed opens "Confirm it's you" as its last step.
 */
export function SecurityItems() {
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
      <>
        <SecurityOption id="password" icon="key" title="changePassword" help="passwordOptionHelp">
          <form onSubmit={(e) => app.submit(e, 'change-password', 'success')}>
            <PasswordField t={app.t} kind="newPassword" />
            <p id="password-help" class="field-help">
              {app.t('passwordHelp')}
            </p>
            <div class="settings-actions">
              <button
                class="primary"
                data-control-id="account.password.change"
                disabled={app.busy()}
              >
                {app.t('changePassword')}
              </button>
            </div>
          </form>
        </SecurityOption>
        <SecurityOption id="email" icon="mail" title="changeEmail" help="changeEmailHelp">
          <form onSubmit={(e) => app.submit(e, 'change-email', 'neutral')}>
            <p class="settings-current">
              <span>{app.t('signInEmail')}</span>
              <strong class="account-email">{app.account()?.email}</strong>
            </p>
            <EmailField t={app.t} />
            <div class="settings-actions">
              <button class="primary" data-control-id="account.email.change" disabled={app.busy()}>
                {app.t('changeEmail')}
              </button>
            </div>
          </form>
        </SecurityOption>
        <SecurityOption id="passkeys" icon="lock" title="managePasskeys" help="passkeyHelp">
          <PasskeySection />
        </SecurityOption>
        <SecurityOption
          id="sessions"
          icon="devices"
          title="manageSessions"
          help="sessionsOptionHelp"
        >
          <Show when={app.sessionError()}>
            <p role="alert">{app.t('sessionFailed')}</p>
          </Show>
          <ul class="settings-list session-list">
            <For each={app.sessions()}>
              {(session) => (
                <li>
                  <span>
                    <Show when={session.current}>
                      <strong>{app.t('current')}</strong>
                      <br />
                    </Show>
                    <time datetime={session.createdAt}>
                      {new Date(session.createdAt).toLocaleString(app.lang())}
                    </time>
                  </span>
                  <button
                    data-control-id="account.sessions.revoke"
                    disabled={app.busy()}
                    onClick={() => void app.revokeSession(session)}
                  >
                    {app.t('revoke')}
                  </button>
                </li>
              )}
            </For>
          </ul>
          <p class="field-help">
            {app.t('sessionHelp')} {app.t('revokeHelp')}
          </p>
          <div class="settings-actions">
            <button
              data-control-id="account.sessions.refresh"
              disabled={app.busy()}
              onClick={() => void app.refreshSessions()}
            >
              {app.t('refresh')}
            </button>
            <button
              class="danger"
              data-control-id="account.sessions.revoke-all"
              disabled={app.busy()}
              onClick={() => void app.revokeAll()}
            >
              {app.t('revokeAll')}
            </button>
          </div>
        </SecurityOption>
      </>
    </Show>
  );
}
