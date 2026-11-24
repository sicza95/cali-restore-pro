import { createEffect, createSignal, Match, Show, Switch } from 'solid-js';
import { EmailField } from '../email-field/EmailField';
import { PasswordField } from '../password-field/PasswordField';
import { SubmitButton } from '../submit-button/SubmitButton';
import { Icon } from '../../icon/Icon';
import { passkeysSupported } from '../../account-access/passkeys';
import type { Submit, Translate } from '../../account-access/types';
import { AccountBadge, AccountChooser } from './AccountChooser';
import {
  noteTypedEmail,
  readRemembered,
  setSignInIntent,
  takeLinkedEmail,
} from './remembered-accounts';

type Step = 'choose' | 'email' | 'password';

/**
 * Email first, then password (Atlassian/Google pattern). Accounts remembered on this device are
 * offered as a list before the email step.
 */
export function SignIn(props: {
  t: Translate;
  busy: boolean;
  submit: Submit;
  passkeySignIn?: () => void;
  heading: (key: 'login' | 'chooseAccount') => void;
}) {
  const initial = readRemembered();
  // A link from an email names the address: start on the email step with it filled in.
  const linked = takeLinkedEmail();
  if (linked) noteTypedEmail(linked);
  const [accounts, setAccounts] = createSignal(initial);
  const [step, setStep] = createSignal<Step>(initial.length && !linked ? 'choose' : 'email');
  const [email, setEmail] = createSignal(linked);
  const [remember, setRemember] = createSignal(false);
  let password: HTMLInputElement | undefined;

  const show = (next: Step) => {
    setStep(next);
    if (next === 'password') queueMicrotask(() => password?.focus());
  };
  createEffect(() => props.heading(step() === 'choose' ? 'chooseAccount' : 'login'));

  const choose = (address: string, keep = true) => {
    setEmail(address);
    noteTypedEmail(address);
    setRemember(keep);
    show('password');
  };
  const onSubmit = (event: SubmitEvent) => {
    if (step() === 'password') {
      setSignInIntent({ remember: remember(), email: email() });
      props.submit(event, 'login', 'success');
      return;
    }
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const input = form.elements.namedItem('email') as HTMLInputElement;
    if (!input.reportValidity()) return;
    // Read the box before the step changes: the email step (and the box) unmounts on choose.
    const keep = (form.elements.namedItem('remember') as HTMLInputElement).checked;
    choose(input.value.trim(), keep);
  };

  return (
    <>
      <Show
        when={step() !== 'choose'}
        fallback={
          <AccountChooser
            t={props.t}
            accounts={accounts()}
            busy={props.busy}
            choose={choose}
            another={() => {
              setEmail('');
              setRemember(false);
              show('email');
            }}
            changed={() => {
              setAccounts(readRemembered());
              if (!accounts().length) show('email');
            }}
          />
        }
      >
        <form
          class="sign-in-form"
          onSubmit={onSubmit}
          onInput={(event) => {
            const field = event.target as HTMLInputElement;
            if (field.name === 'email' && field.type === 'email')
              noteTypedEmail(field.value.trim());
          }}
        >
          <Switch>
            <Match when={step() === 'email'}>
              <Show when={accounts().length}>
                <button
                  type="button"
                  class="sign-in-back"
                  data-control-id="auth.remembered.back"
                  onClick={() => show('choose')}
                >
                  <Icon name="back" size={18} />
                  {props.t('accountsOnDevice')}
                </button>
              </Show>
              <EmailField t={props.t} value={email()} autofocus />
              <label class="sign-in-remember">
                <input
                  type="checkbox"
                  name="remember"
                  data-control-id="auth.remember"
                  checked={remember()}
                  onChange={(event) => setRemember(event.currentTarget.checked)}
                />
                {props.t('rememberMe')}
              </label>
            </Match>
            <Match when={step() === 'password'}>
              <div class="sign-in-row sign-in-chosen">
                <AccountBadge email={email()} />
                <span class="sign-in-row-text">
                  <span class="sign-in-email">{email()}</span>
                </span>
                <button
                  type="button"
                  class="sign-in-switch"
                  data-control-id="auth.switch-account"
                  onClick={() => show(accounts().length ? 'choose' : 'email')}
                >
                  {props.t('switchAccount')}
                </button>
              </div>
              {/* Password managers pair the password with this username field. */}
              <input
                class="account-visually-hidden"
                type="email"
                name="email"
                autocomplete="username"
                // defaultValue, not value: a failed sign-in resets the form and must keep it.
                ref={(el) => createEffect(() => (el.defaultValue = email()))}
                readOnly
                tabIndex={-1}
                aria-hidden="true"
              />
              <PasswordField t={props.t} kind="password" ref={(el) => (password = el)} />
              <a class="sign-in-forgot" href="/forgot-password">
                {props.t('forgot')}
              </a>
            </Match>
          </Switch>
          <SubmitButton controlId="auth.login" t={props.t} busy={props.busy} label="login" />
        </form>
      </Show>
      <Show when={props.passkeySignIn && passkeysSupported()}>
        <button
          type="button"
          class="sign-in-passkey"
          data-control-id="auth.passkey"
          disabled={props.busy}
          onClick={() => {
            setSignInIntent({ remember: step() === 'choose' || remember() });
            props.passkeySignIn?.();
          }}
        >
          {props.t('passkeySignIn')}
        </button>
      </Show>
    </>
  );
}
