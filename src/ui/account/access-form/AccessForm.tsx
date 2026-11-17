import { Show } from 'solid-js';
import { EmailField } from '../email-field/EmailField';
import { PasswordField } from '../password-field/PasswordField';
import { SubmitButton } from '../submit-button/SubmitButton';
import { Icon } from '../../icon/Icon';
import { passkeysSupported } from '../../account-access/passkeys';
import plaster from './painted-plaster.jpg';
import type { AccessFormProps } from './types';

export function AccessForm(props: AccessFormProps) {
  const linkView = () =>
    props.view === 'verify-email' ||
    props.view === 'confirm-email' ||
    props.view === 'reset-password';
  return (
    <section class="access-layout">
      <div class="access-form">
        <header>
          <h1>{props.t(props.view)}</h1>
          <p>{props.t('accessHelp')}</p>
        </header>
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
                props.view === 'recover-deleted-account' ||
                props.view === 'reset-password'
              }
            >
              <PasswordField
                t={props.t}
                kind={
                  props.view === 'login' || props.view === 'recover-deleted-account'
                    ? 'password'
                    : 'newPassword'
                }
              />
            </Show>
            <Show when={props.view === 'register' || props.view === 'reset-password'}>
              <p id="password-help" class="field-help">
                {props.t('passwordHelp')}
              </p>
            </Show>
            <SubmitButton
              controlId={'auth.' + props.view}
              t={props.t}
              busy={props.busy()}
              label={props.view === 'login' ? 'login' : 'submit'}
            />
            <Show when={props.view === 'login'}>
              <a href="/forgot-password">{props.t('forgot')}</a>
            </Show>
          </form>
        </Show>
        <Show when={props.view === 'login' && props.passkeySignIn && passkeysSupported()}>
          <button
            type="button"
            data-control-id="auth.passkey"
            disabled={props.busy()}
            onClick={() => props.passkeySignIn?.()}
          >
            {props.t('passkeySignIn')}
          </button>
        </Show>
        <Show when={props.view === 'login'}>
          <div class="access-recovery">
            <a href="/verify-email">{props.t('resend')}</a>
            <a href="/recover-deleted-account">{props.t('recover-deleted-account')}</a>
          </div>
        </Show>
        <Show when={props.view === 'recover-deleted-account'}>
          <a href="/login">{props.t('login')}</a>
        </Show>
        <Show when={props.view === 'verify-email'}>
          <details>
            <summary data-control-id="auth.resend.open">{props.t('resend')}</summary>
            <form onSubmit={(e) => props.submit(e, 'resend-verification', 'neutral')}>
              <EmailField t={props.t} />
              <SubmitButton
                t={props.t}
                busy={props.busy()}
                label="resend"
                controlId="auth.resend"
              />
            </form>
          </details>
        </Show>
      </div>
      <figure class="access-specimen">
        <img src={plaster} width="1152" height="768" alt="" />
        <figcaption>
          <Icon name="photo" size={18} />
          {props.t('specimen')}
        </figcaption>
      </figure>
    </section>
  );
}
