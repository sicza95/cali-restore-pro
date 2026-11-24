import { createEffect, createSignal, on, Show } from 'solid-js';
import { useApp } from '../app-context/AppContext';
import { passkeysSupported } from '../account-access/passkeys';
import type { Message } from '../account-access/types';
import { Icon } from '../icon/Icon';
import './confirm-identity.css';

/**
 * "Confirm it's you": the last step of a security change, shown only when the server asks for a
 * fresh confirmation. The password or one of the account's passkeys confirms; the change then
 * goes through without being asked again.
 */
export function ConfirmIdentity() {
  const app = useApp();
  const [problem, setProblem] = createSignal<Message>();
  const [working, setWorking] = createSignal(false);
  let dialog: HTMLDialogElement | undefined;
  let password: HTMLInputElement | undefined;
  createEffect(() => {
    if (!dialog) return;
    if (app.identityCheck.open() && !dialog.open) {
      setProblem(undefined);
      if (password) password.value = '';
      dialog.showModal();
    } else if (!app.identityCheck.open() && dialog.open) dialog.close();
  });
  // Going to another page (Back, a link elsewhere) cancels the change this dialog guards.
  createEffect(
    on(app.router.route, () => app.identityCheck.open() && app.identityCheck.cancel(), {
      defer: true,
    }),
  );
  const confirm = async (usePassword: boolean) => {
    setWorking(true);
    setProblem(await app.confirmIdentity(usePassword ? (password?.value ?? '') : undefined));
    setWorking(false);
    if (problem() && usePassword) password?.select();
  };
  return (
    <dialog
      ref={(el) => (dialog = el)}
      class="confirm-identity"
      aria-labelledby="confirm-identity-title"
      aria-describedby="confirm-identity-help"
      // Escape cancels the change.
      onCancel={() => app.identityCheck.cancel()}
    >
      <form
        method="dialog"
        onSubmit={(event) => {
          event.preventDefault();
          void confirm(true);
        }}
      >
        <span class="confirm-identity-icon" aria-hidden="true">
          <Icon name="lock" size={22} />
        </span>
        <h2 id="confirm-identity-title">{app.t('confirmIdentityTitle')}</h2>
        <p id="confirm-identity-help">{app.t('confirmIdentityHelp')}</p>
        <Show when={app.account()?.email}>
          {(email) => (
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
          )}
        </Show>
        <label>
          {app.t('currentPassword')}
          <input
            ref={(el) => (password = el)}
            type="password"
            name="password"
            autocomplete="current-password"
            required
            maxlength={1024}
            data-control-id="account.confirm"
            aria-invalid={problem() ? 'true' : undefined}
            aria-describedby={problem() ? 'confirm-identity-problem' : undefined}
          />
        </label>
        <Show when={problem()}>
          {(key) => (
            <p id="confirm-identity-problem" role="alert" class="confirm-identity-problem">
              {app.t(key())}
            </p>
          )}
        </Show>
        <div class="confirm-identity-actions">
          <button
            type="button"
            data-control-id="account.confirm.cancel"
            onClick={() => app.identityCheck.cancel()}
          >
            {app.t('cancelButton')}
          </button>
          <button class="primary" data-control-id="account.confirm.password" disabled={working()}>
            {app.t('confirmButton')}
          </button>
        </div>
        <Show when={passkeysSupported()}>
          <button
            type="button"
            class="confirm-identity-passkey"
            data-control-id="account.confirm.passkey"
            disabled={working()}
            onClick={() => void confirm(false)}
          >
            <Icon name="account" size={18} />
            {app.t('confirmWithPasskey')}
          </button>
        </Show>
      </form>
    </dialog>
  );
}
