import { For, Show, createSignal, onMount } from 'solid-js';
import { useApp } from '../../app-context/AppContext';
import { passkeysSupported, type PasskeyInfo } from '../../account-access/passkeys';

type PasskeyList = { available: boolean; passkeys: PasskeyInfo[] };

/** Optional passkeys: a sign-in factor only, managed after a recent password confirmation. */
export function PasskeySection() {
  const app = useApp();
  const [passkeys, setPasskeys] = createSignal<PasskeyInfo[]>([]);
  const [available, setAvailable] = createSignal(passkeysSupported());
  const [removeConfirmed, setRemoveConfirmed] = createSignal(false);
  const [loadFailed, setLoadFailed] = createSignal(false);
  const date = (iso: string) => new Date(iso).toLocaleString(app.lang());
  // Like the session list, a failed load stays inside this section; /auth/me owns the session.
  const refresh = async () => {
    try {
      const result = await app.request<PasskeyList>('passkeys');
      setLoadFailed(false);
      setPasskeys(result.passkeys);
      setAvailable(result.available && passkeysSupported());
    } catch {
      setLoadFailed(true);
    }
  };
  onMount(() => void refresh());
  const sync = (item: PasskeyInfo) =>
    item.backupState
      ? app.t('passkeySynced')
      : item.backupEligible
        ? app.t('passkeySyncable')
        : app.t('passkeyDevice');
  const add = async (event: SubmitEvent) => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const name = String(new FormData(form).get('passkey-name') ?? '');
    if (await app.addPasskey(name)) form.reset();
    await refresh();
  };
  const remove = async (item: PasskeyInfo) => {
    await app.run('passkeys/remove', { passkeyId: item.id, confirm: true }, 'passkeyRemoved');
    setRemoveConfirmed(false);
    await refresh();
  };
  return (
    <section class="account-section" aria-labelledby="passkeys-heading">
      <div>
        <h2 id="passkeys-heading">{app.t('passkeys')}</h2>
        <p>{app.t('passkeyHelp')}</p>
      </div>
      <div class="account-panel">
        <Show when={loadFailed()}>
          <p role="alert">{app.t('passkeyLoadFailed')}</p>
        </Show>
        <ul class="passkey-list">
          <For each={passkeys()} fallback={<li>{app.t('noPasskeys')}</li>}>
            {(item) => (
              <li>
                <span>
                  <strong>{item.name}</strong> · {sync(item)}
                  <br />
                  {app.t('passkeyAddedAt')}{' '}
                  <time datetime={item.createdAt}>{date(item.createdAt)}</time>
                  {' · '}
                  <Show when={item.lastUsedAt} fallback={app.t('passkeyNeverUsed')}>
                    {(used) => (
                      <>
                        {app.t('passkeyLastUsed')} <time datetime={used()}>{date(used())}</time>
                      </>
                    )}
                  </Show>
                </span>
                <Show when={item.cloneWarning}>
                  <span role="note" class="passkey-warning">
                    {app.t('passkeyWarning')}
                  </span>
                </Show>
                <button
                  data-control-id="account.passkeys.remove"
                  aria-label={`${app.t('removePasskey')}: ${item.name}`}
                  disabled={app.busy() || !app.confirmed() || !removeConfirmed()}
                  onClick={() => void remove(item)}
                >
                  {app.t('removePasskey')}
                </button>
              </li>
            )}
          </For>
        </ul>
        <Show when={passkeys().length > 0}>
          <label class="confirmation">
            <input
              type="checkbox"
              checked={removeConfirmed()}
              onChange={(e) => setRemoveConfirmed(e.currentTarget.checked)}
            />
            {app.t('confirmation')}
          </label>
        </Show>
        <Show when={available()} fallback={<p>{app.t('passkeyUnsupported')}</p>}>
          <form class="passkey-add" onSubmit={(e) => void add(e)}>
            <label>
              {app.t('passkeyName')}
              <input name="passkey-name" required maxlength={64} autocomplete="off" />
            </label>
            <button
              data-control-id="account.passkeys.add"
              disabled={app.busy() || !app.confirmed()}
            >
              {app.t('addPasskey')}
            </button>
          </form>
        </Show>
      </div>
    </section>
  );
}
