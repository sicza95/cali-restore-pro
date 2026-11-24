import { createSignal, For, Show } from 'solid-js';
import { Icon } from '../../icon/Icon';
import type { Translate } from '../../account-access/types';
import { accountInitial, forgetAccount, type RememberedAccount } from './remembered-accounts';

export function AccountBadge(props: { email: string }) {
  return (
    <span class="sign-in-badge" aria-hidden="true">
      {accountInitial(props.email)}
    </span>
  );
}

/** Google-style list of the accounts remembered on this device. */
export function AccountChooser(props: {
  t: Translate;
  accounts: RememberedAccount[];
  busy: boolean;
  choose: (email: string) => void;
  another: () => void;
  changed: () => void;
}) {
  const [removing, setRemoving] = createSignal(false);
  return (
    <div class="sign-in-accounts">
      <ul role="list">
        <For each={props.accounts}>
          {(account) => (
            <li>
              <Show
                when={removing()}
                fallback={
                  <button
                    type="button"
                    class="sign-in-row"
                    data-control-id="auth.remembered.choose"
                    disabled={props.busy}
                    onClick={() => props.choose(account.email)}
                  >
                    <AccountBadge email={account.email} />
                    <span class="sign-in-row-text">
                      <span class="sign-in-email">{account.email}</span>
                      <span class="sign-in-muted">{props.t('accountSignedOut')}</span>
                    </span>
                  </button>
                }
              >
                <div class="sign-in-row">
                  <AccountBadge email={account.email} />
                  <span class="sign-in-row-text">
                    <span class="sign-in-email">{account.email}</span>
                  </span>
                  <button
                    type="button"
                    class="sign-in-forget"
                    data-control-id="auth.remembered.forget"
                    aria-label={`${props.t('forgetAccount')}: ${account.email}`}
                    title={props.t('forgetAccount')}
                    onClick={() => {
                      forgetAccount(account.email);
                      props.changed();
                    }}
                  >
                    <Icon name="minus" size={18} />
                  </button>
                </div>
              </Show>
            </li>
          )}
        </For>
        <li>
          <button
            type="button"
            class="sign-in-row"
            data-control-id="auth.remembered.another"
            onClick={() => props.another()}
          >
            <span class="sign-in-row-icon">
              <Icon name="account" size={20} />
            </span>
            <span class="sign-in-email">{props.t('useAnotherAccount')}</span>
          </button>
        </li>
        <Show when={!removing()}>
          <li>
            <button
              type="button"
              class="sign-in-row"
              data-control-id="auth.remembered.edit"
              onClick={() => setRemoving(true)}
            >
              <span class="sign-in-row-icon">
                <Icon name="minus" size={20} />
              </span>
              <span class="sign-in-email">{props.t('removeAccount')}</span>
            </button>
          </li>
        </Show>
      </ul>
      <Show when={removing()}>
        <button
          type="button"
          class="sign-in-done"
          data-control-id="auth.remembered.done"
          onClick={() => setRemoving(false)}
        >
          {props.t('doneRemoving')}
        </button>
      </Show>
    </div>
  );
}
