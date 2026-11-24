import { createSignal, Match, onMount, Show, Switch, untrack } from 'solid-js';
import { useApp } from '../../app-context/AppContext';
import { EmailField } from '../email-field/EmailField';
import { PasswordField } from '../password-field/PasswordField';
import { SubmitButton } from '../submit-button/SubmitButton';
import { typedEmail } from '../sign-in/remembered-accounts';
import { CodeInput } from './CodeInput';
import { ProfileFields } from '../profile-fields/ProfileFields';

type Step = 'email' | 'code' | 'checking' | 'password' | 'invalidLink';
type Proof = { email: string; code: string } | { token: string };

/** Control ids and words that differ between Create account and Can’t sign in. */
const modes = {
  register: {
    send: 'register',
    email: 'auth.register',
    code: 'auth.register.code',
    resend: 'auth.register.resend',
    other: 'auth.register.other-email',
    complete: 'auth.register.complete',
    completeLabel: 'register',
    restart: '/register',
  },
  reset: {
    send: 'forgot-password',
    email: 'auth.forgot-password',
    code: 'auth.reset.code',
    resend: 'auth.reset.resend',
    other: 'auth.reset.other-email',
    complete: 'auth.reset-password',
    completeLabel: 'savePassword',
    restart: '/forgot-password',
  },
} as const;

/**
 * Create account and Can’t sign in share one flow: the email gets a link and a six-digit code.
 * The code boxes check themselves after the last digit; the link (`token`) skips straight to the
 * password. Saving the password signs the person in. In `reset` mode an address with no account
 * gets a sign-up code instead, so the page asks for a code either way and reveals nothing.
 */
export function SignUp(props: { token?: string; mode?: keyof typeof modes }) {
  const app = useApp();
  const t = app.t;
  const mode = modes[untrack(() => props.mode) ?? 'register'];
  // The link page mounts this once per link, so the token is read once.
  const token = untrack(() => props.token);
  const [step, setStep] = createSignal<Step>(token ? 'checking' : 'email');
  // Can’t sign in starts with the address from the sign-in page.
  const [email, setEmail] = createSignal(mode.send === 'forgot-password' ? typedEmail() : '');
  const [proof, setProof] = createSignal<Proof>();
  type Problem = 'codeWrong' | 'limited' | 'unavailable';
  const [wrongCode, setWrongCode] = createSignal<Problem>();
  const [sendProblem, setSendProblem] = createSignal<Problem>();
  const [sending, setSending] = createSignal(false);
  // A new account is named and may get a photo together with its first password.
  const [photo, setPhoto] = createSignal<string>();
  const problem = (error: unknown, link: Problem): Problem => {
    const code = error instanceof Error ? error.message : '';
    return code === 'try_later'
      ? 'limited'
      : code === 'invalid_or_expired_link'
        ? link
        : 'unavailable';
  };
  let codeBoxes: { clear: () => void } | undefined;
  let repeat: HTMLInputElement | undefined;

  const check = async (candidate: Proof) => {
    try {
      await app.request('code/check', candidate);
      setProof(candidate);
      setStep('password');
      return true;
    } catch (error) {
      setWrongCode(problem(error, 'codeWrong'));
      return false;
    }
  };
  onMount(() => {
    if (token)
      void check({ token }).then((ok) => {
        if (!ok) setStep('invalidLink');
      });
  });

  // The code step itself says where the email went, so no separate banner.
  const send = async (address: string) => {
    if (sending()) return;
    setSending(true);
    setSendProblem(undefined);
    try {
      await app.request(mode.send, { email: address, language: app.lang() });
      setEmail(address);
      setWrongCode(undefined);
      setStep('code');
      codeBoxes?.clear();
    } catch (error) {
      setSendProblem(problem(error, 'unavailable'));
    } finally {
      setSending(false);
    }
  };

  return (
    <Switch>
      <Match when={step() === 'email'}>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const input = event.currentTarget.elements.namedItem('email') as HTMLInputElement;
            void send(input.value.trim());
          }}
        >
          <EmailField t={t} value={email()} autofocus />
          <Show when={sendProblem()}>
            {(key) => (
              <p class="sign-up-error" role="alert">
                {t(key())}
              </p>
            )}
          </Show>
          <SubmitButton controlId={mode.email} t={t} busy={sending()} label="submit" />
        </form>
      </Match>
      <Match when={step() === 'code'}>
        <div class="sign-up-step">
          <p>
            {t('codeSentTo')} <strong class="sign-up-email">{email()}</strong>
          </p>
          <CodeInput
            t={t}
            disabled={sending() || wrongCode() === 'limited'}
            invalid={!!wrongCode()}
            controlId={mode.code}
            ref={(api) => (codeBoxes = api)}
            complete={(code) => {
              setWrongCode(undefined);
              void check({ email: email(), code }).then((ok) => {
                if (!ok) codeBoxes?.clear();
              });
            }}
          />
          <Show when={wrongCode()} fallback={<p class="field-help">{t('codeHelp')}</p>}>
            {(key) => (
              <p class="sign-up-error" role="alert">
                {t(key())}
              </p>
            )}
          </Show>
          <div class="sign-up-actions">
            <button
              type="button"
              data-control-id={mode.resend}
              disabled={sending()}
              onClick={() => void send(email())}
            >
              {t('resendCode')}
            </button>
            <button
              type="button"
              data-control-id={mode.other}
              onClick={() => {
                setWrongCode(undefined);
                setStep('email');
              }}
            >
              {t('useOtherEmail')}
            </button>
          </div>
        </div>
      </Match>
      <Match when={step() === 'checking'}>
        <p role="status">{t('checkingCode')}</p>
      </Match>
      <Match when={step() === 'invalidLink'}>
        <p role="alert">{t('invalid')}</p>
        <a href={mode.restart}>{t(mode.send)}</a>
      </Match>
      <Match when={step() === 'password'}>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const password = (form.elements.namedItem('password') as HTMLInputElement).value;
            if (repeat && repeat.value !== password) {
              repeat.setCustomValidity(t('passwordMismatch'));
              repeat.reportValidity();
              return;
            }
            const profile =
              mode.send === 'register'
                ? {
                    name: (form.elements.namedItem('full-name') as HTMLInputElement).value,
                    ...(photo() ? { photo: photo() } : {}),
                  }
                : {};
            void app.run('code/complete', { ...proof(), password, ...profile }, 'success');
          }}
        >
          <Show when={email()}>
            <p class="sign-up-email">{email()}</p>
            {/* Lets a password manager save the new password under this address. */}
            <input
              class="account-visually-hidden"
              type="email"
              name="email"
              autocomplete="username"
              value={email()}
              readOnly
              tabIndex={-1}
              aria-hidden="true"
            />
          </Show>
          <Show when={mode.send === 'register'}>
            <ProfileFields
              t={t}
              controls="auth.register"
              email={email()}
              onPhoto={setPhoto}
              autofocus
            />
          </Show>
          <PasswordField
            t={t}
            kind="newPassword"
            ref={(el) => mode.send !== 'register' && queueMicrotask(() => el.focus())}
          />
          <label>
            {t('repeatPassword')}
            <input
              ref={(el) => (repeat = el)}
              name="repeat"
              type="password"
              autocomplete="new-password"
              required
              minLength={15}
              maxlength={1024}
              onInput={(event) => event.currentTarget.setCustomValidity('')}
            />
          </label>
          <p id="password-help" class="field-help">
            {t('passwordHelp')}
          </p>
          <SubmitButton
            controlId={mode.complete}
            t={t}
            busy={app.busy()}
            label={mode.completeLabel}
          />
        </form>
      </Match>
    </Switch>
  );
}
