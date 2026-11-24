import { createSignal, Match, Show, Switch } from 'solid-js';
import { EmailField } from '../email-field/EmailField';
import { PasswordField } from '../password-field/PasswordField';
import { SubmitButton } from '../submit-button/SubmitButton';
import { Icon } from '../../icon/Icon';
import { SignIn } from '../sign-in/SignIn';
import { SignUp } from '../sign-up/SignUp';
import type { AccessFormProps } from './types';

/** One centered card for every signed-out page: brand, title, the form and its links. */
export function AccessForm(props: AccessFormProps) {
  const [heading, setHeading] = createSignal<'login' | 'chooseAccount'>('login');
  const linkView = () => props.view === 'confirm-email';
  return (
    <section class="access-card">
      <header>
        <span class="access-brand">
          <Icon name="brand" size={30} />
          <span>
            CaliRestore <strong>Pro</strong>
          </span>
        </span>
        <h1>
          {props.view === 'login'
            ? props.t(heading())
            : props.view === 'verify-email'
              ? props.t('choosePassword')
              : props.t(props.view)}
        </h1>
      </header>
      <Switch>
        <Match when={props.view === 'login'}>
          <SignIn
            t={props.t}
            busy={props.busy()}
            submit={props.submit}
            passkeySignIn={props.passkeySignIn}
            heading={setHeading}
          />
        </Match>
        <Match when={props.view === 'register'}>
          <SignUp />
        </Match>
        <Match when={props.view === 'verify-email'}>
          <Show when={props.linkToken} fallback={<p>{props.t('missingLink')}</p>}>
            {(token) => <SignUp token={token()} />}
          </Show>
        </Match>
        <Match when={props.view === 'forgot-password'}>
          <SignUp mode="reset" />
        </Match>
        <Match when={props.view === 'reset-password'}>
          <Show when={props.linkToken} fallback={<p>{props.t('missingLink')}</p>}>
            {(token) => <SignUp mode="reset" token={token()} />}
          </Show>
        </Match>
        <Match when={true}>
          <Show when={!linkView() || props.linkToken} fallback={<p>{props.t('missingLink')}</p>}>
            <form onSubmit={(e) => props.submit(e, props.view, 'success')}>
              <Show when={!linkView()}>
                <EmailField t={props.t} />
              </Show>
              <Show when={props.view === 'recover-deleted-account'}>
                <PasswordField t={props.t} kind="password" />
              </Show>
              <SubmitButton
                controlId={'auth.' + props.view}
                t={props.t}
                busy={props.busy()}
                label="submit"
              />
            </form>
          </Show>
        </Match>
      </Switch>
      <nav class="access-links" aria-label={props.t('account')}>
        <Show
          when={props.view === 'login'}
          fallback={
            <>
              <a href="/login">{props.t('backToSignIn')}</a>
              <Show when={props.view === 'forgot-password'}>
                <a href="/recover-deleted-account">{props.t('recover-deleted-account')}</a>
              </Show>
            </>
          }
        >
          <a href="/forgot-password">{props.t('cantSignIn')}</a>
          <a href="/register">{props.t('register')}</a>
        </Show>
      </nav>
    </section>
  );
}
