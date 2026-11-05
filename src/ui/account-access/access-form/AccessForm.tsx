import { Show } from 'solid-js';
import { EmailField } from '../email-field/EmailField';
import { PasswordField } from '../password-field/PasswordField';
import { SubmitButton } from '../submit-button/SubmitButton';
import type { AccessFormProps } from './types';

export function AccessForm(props: AccessFormProps) {
  const linkView = () =>
    props.view === 'verify-email' ||
    props.view === 'confirm-email' ||
    props.view === 'reset-password';
  return (
    <section class="account-section">
      <div>
        <h2>{props.t(linkView() ? props.view : 'account')}</h2>
        <p>{props.t('accessHelp')}</p>
      </div>
      <div class="account-panel">
        <Show when={!linkView() || props.linkToken} fallback={<p>{props.t('missingLink')}</p>}>
          <form
            onSubmit={(e) =>
              props.submit(
                e,
                props.view,
                props.view === 'register' || props.view === 'forgot-password'
                  ? 'neutral'
                  : 'success',
              )
            }
          >
            <Show when={!linkView()}>
              <EmailField t={props.t} />
            </Show>
            <Show
              when={
                props.view === 'login' ||
                props.view === 'register' ||
                props.view === 'reset-password'
              }
            >
              <PasswordField
                t={props.t}
                kind={props.view === 'login' ? 'password' : 'newPassword'}
              />
            </Show>
            <Show when={props.view === 'register' || props.view === 'reset-password'}>
              <p id="password-help" class="field-help">
                {props.t('passwordHelp')}
              </p>
            </Show>
            <SubmitButton
              t={props.t}
              busy={props.busy()}
              label={props.view === 'login' ? 'login' : 'submit'}
            />
            <Show when={props.view === 'login'}>
              <a href="/forgot-password">{props.t('forgot')}</a>
            </Show>
          </form>
        </Show>
        <Show when={props.view === 'login'}>
          <a href="/verify-email">{props.t('resend')}</a>
        </Show>
        <Show when={props.view === 'verify-email'}>
          <details>
            <summary>{props.t('resend')}</summary>
            <form onSubmit={(e) => props.submit(e, 'resend-verification', 'neutral')}>
              <EmailField t={props.t} />
              <SubmitButton t={props.t} busy={props.busy()} label="resend" />
            </form>
          </details>
        </Show>
      </div>
    </section>
  );
}
