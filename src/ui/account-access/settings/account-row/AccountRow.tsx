import { createSignal, For, Show } from 'solid-js';
import { ConfirmField } from '../../confirm-field/ConfirmField';
import { settingsCopy } from '../constants';
import type { AdminAccount, SettingsProps } from '../types';

export function AccountRow(props: SettingsProps & { account: AdminAccount; refresh: () => void }) {
  const a = () => props.account;
  const c = () => settingsCopy[props.model.lang()];
  const [blocked, setBlocked] = createSignal(false);
  const ready = () => a().state === 'active' || a().state === 'suspended';
  const disabled = () => props.model.busy() || !props.model.confirmed();
  const apply = (action: string, body: object) =>
    props.model.run('/admin/accounts/' + a().id + '/' + action, body, 'adminSaved').then((ok) => {
      if (ok) props.refresh();
    });
  const submit = (e: SubmitEvent, action: string, build: (data: FormData) => object) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget as HTMLFormElement);
    if (!data.has('confirm')) return;
    void apply(action, { confirm: true, ...build(data) });
  };
  return (
    <li>
      <details>
        <summary>
          <strong class="account-email">{a().email}</strong>
          <span>
            {c()[a().role]} · {c()[a().state]}
          </span>
        </summary>
        <p>
          {props.model.t('sessions')}: {a().sessions.toLocaleString(props.model.lang())} ·{' '}
          {c().quota}: {a().quotaMiB.toLocaleString(props.model.lang())}
        </p>
        <div class="admin-controls">
          <Show when={ready() && props.model.can('accounts.suspend')}>
            <form
              onSubmit={(e) =>
                submit(e, 'policy', (data) => ({
                  role: data.get('role') ?? a().role,
                  state: data.get('state'),
                }))
              }
            >
              <Show when={props.model.can('roles.manage')}>
                <label>
                  {c().role}
                  <select name="role" value={a().role}>
                    <For each={['member', 'administrator', 'superuser'] as const}>
                      {(role) => <option value={role}>{c()[role]}</option>}
                    </For>
                  </select>
                </label>
              </Show>
              <label>
                {c().state}
                <select name="state" value={a().state}>
                  <option value="active">{c().active}</option>
                  <option value="suspended">{c().suspended}</option>
                </select>
              </label>
              <ConfirmField t={props.model.t} />
              <button class="secondary" disabled={disabled()}>
                {c().changePolicy}
              </button>
            </form>
          </Show>
          <Show when={ready() && props.model.can('accounts.entitlements')}>
            <form
              onSubmit={(e) =>
                submit(e, 'controls', (data) => ({
                  entitlement: {
                    serverFeatures: data.has('serverFeatures'),
                    quotaMiB: Number(data.get('quotaMiB')),
                  },
                }))
              }
            >
              <h2>{c().entitlement}</h2>
              <p class="field-help">{c().hostingHelp}</p>
              <label class="confirmation">
                <input name="serverFeatures" type="checkbox" checked={a().serverFeatures} />
                {c().granted}
              </label>
              <label>
                {c().quota}
                <input
                  name="quotaMiB"
                  type="number"
                  min="0"
                  max="1048576"
                  step="1"
                  required
                  value={a().quotaMiB}
                />
              </label>
              <ConfirmField t={props.model.t} />
              <button class="secondary" disabled={disabled()}>
                {c().saveEntitlement}
              </button>
            </form>
          </Show>
          <Show when={ready() && props.model.can('roles.manage') && a().role === 'administrator'}>
            <form
              onSubmit={(e) =>
                submit(e, 'controls', (data) => ({
                  permissions: ['lifecycle', 'hosting', 'operations'].reduce(
                    (mask, key, index) => mask | (data.has(key) ? 1 << index : 0),
                    0,
                  ),
                }))
              }
            >
              <h2>{c().delegation}</h2>
              <For each={['lifecycle', 'hosting', 'operations'] as const}>
                {(key, index) => (
                  <label class="confirmation">
                    <input
                      type="checkbox"
                      name={key}
                      checked={Boolean(a().permissions & (1 << index()))}
                    />
                    {c()[key]}
                  </label>
                )}
              </For>
              <ConfirmField t={props.model.t} />
              <button class="secondary" disabled={disabled()}>
                {c().saveDelegation}
              </button>
            </form>
          </Show>
          <Show
            when={
              props.model.can('accounts.sessions.revoke') && a().id !== props.model.account()?.id
            }
          >
            <form onSubmit={(e) => submit(e, 'sessions/revoke', () => ({}))}>
              <ConfirmField t={props.model.t} />
              <button class="secondary" disabled={disabled()}>
                {props.model.t('revokeAll')}
              </button>
            </form>
          </Show>
          <Show when={props.model.can('roles.manage')}>
            <div>
              <button
                class="secondary"
                disabled={props.model.busy()}
                onClick={async () => {
                  const result = await props.model.read<{ eligible: boolean }>(
                    '/admin/accounts/' + a().id + '/deletion-preflight',
                  );
                  setBlocked(result?.eligible === false);
                }}
              >
                {c().preflight}
              </button>
              <Show when={blocked()}>
                <p role="status">{c().blocked}</p>
              </Show>
            </div>
          </Show>
        </div>
      </details>
    </li>
  );
}
