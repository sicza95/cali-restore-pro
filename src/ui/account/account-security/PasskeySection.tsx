import { For, Show, createSignal, onMount } from 'solid-js';
import { useApp } from '../../app-context/AppContext';
import { passkeysSupported, type PasskeyInfo } from '../../account-access/passkeys';

type PasskeyList = { available: boolean; passkeys: PasskeyInfo[] };

/** A starting name the person can keep or change: the platform, never the browser build. */
function deviceName() {
  const agent = navigator.userAgent;
  if (/iPad|Macintosh/.test(agent) && navigator.maxTouchPoints > 1) return 'iPad';
  return ['iPhone', 'Android', 'Windows', 'Mac', 'Linux'].find((name) =>
    agent.includes(name === 'Mac' ? 'Macintosh' : name),
  );
}

/** Optional passkeys: a sign-in factor only. Adding or removing one confirms the person first. */
export function PasskeySection() {
  const app = useApp();
  const [passkeys, setPasskeys] = createSignal<PasskeyInfo[]>([]);
  const [available, setAvailable] = createSignal(passkeysSupported());
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
    await refresh();
  };
  return (
    <div class="passkey-section">
      <Show when={loadFailed()}>
        <p role="alert">{app.t('passkeyLoadFailed')}</p>
      </Show>
      <ul class="settings-list passkey-list" aria-label={app.t('passkeys')}>
        <For
          each={passkeys()}
          fallback={<li class="settings-list-empty">{app.t('noPasskeys')}</li>}
        >
          {(item) => (
            <li>
              <span>
                <strong>{item.name}</strong> · {sync(item)}
                <br />
                <span class="field-help">
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
              </span>
              <Show when={item.cloneWarning}>
                <span role="note" class="passkey-warning">
                  {app.t('passkeyWarning')}
                </span>
              </Show>
              <button
                data-control-id="account.passkeys.remove"
                aria-label={`${app.t('removePasskey')}: ${item.name}`}
                disabled={app.busy()}
                onClick={() => void remove(item)}
              >
                {app.t('removePasskey')}
              </button>
            </li>
          )}
        </For>
      </ul>
      <Show when={available()} fallback={<p>{app.t('passkeyUnsupported')}</p>}>
        <form class="passkey-add" onSubmit={(e) => void add(e)}>
          <label>
            {app.t('passkeyName')}
            <input
              name="passkey-name"
              required
              maxlength={64}
              autocomplete="off"
              value={deviceName() ?? app.t('passkeyDefaultName')}
            />
          </label>
          <button class="primary" data-control-id="account.passkeys.add" disabled={app.busy()}>
            {app.t('addPasskey')}
          </button>
        </form>
      </Show>
    </div>
  );
}
