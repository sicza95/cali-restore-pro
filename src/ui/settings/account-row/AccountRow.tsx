import { AccountDeletion } from '../profile/AccountDeletion';
import { useApp } from '../../../app-context/AppContext';
import { For, Show } from 'solid-js';
import { ConfirmField } from '../../confirm-field/ConfirmField';
import { settingsCopy } from '../constants';
import type { AdminAccount } from '../types';

export function AccountRow(props: { account: AdminAccount; refresh: () => void }) {
  const app = useApp();
  const a = () => props.account;
  const c = () => settingsCopy[app.lang()];
  const ready = () => a().state === 'active' || a().state === 'suspended';
  const disabled = () => app.busy() || !app.confirmed();
  const apply = (action: string, body: object) =>
    app.run('/admin/accounts/' + a().id + '/' + action, body, 'adminSaved').then((ok) => {
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
        <summary data-control-id="admin.account.open">
          <strong class="account-email">{a().email}</strong>
          <span>
            {c()[a().role]} · {c()[a().state]}
          </span>
        </summary>
        <p>
          {app.t('sessions')}: {a().sessions.toLocaleString(app.lang())} · {c().quota}:{' '}
          {a().quotaMiB.toLocaleString(app.lang())}
        </p>
        <div class="admin-controls">
          <Show when={ready() && app.can('accounts.suspend')}>
            <form
              onSubmit={(e) =>
                submit(e, 'policy', (data) => ({
                  role: data.get('role') ?? a().role,
                  state: data.get('state'),
                }))
              }
            >
              <Show when={app.can('roles.manage')}>
                <label>
                  {c().role}
                  <select data-control-id="admin.account.role" name="role" value={a().role}>
                    <For each={['member', 'administrator', 'superuser'] as const}>
                      {(role) => <option value={role}>{c()[role]}</option>}
                    </For>
                  </select>
                </label>
              </Show>
              <label>
                {c().state}
                <select data-control-id="admin.account.state" name="state" value={a().state}>
                  <option value="active">{c().active}</option>
                  <option value="suspended">{c().suspended}</option>
                </select>
              </label>
              <ConfirmField t={app.t} />
              <button
                data-control-id="admin.account.policy"
                class="secondary"
                disabled={disabled()}
              >
                {c().changePolicy}
              </button>
            </form>
          </Show>
          <Show when={ready() && app.can('accounts.entitlements')}>
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
                <input
                  data-control-id="admin.account.grant"
                  name="serverFeatures"
                  type="checkbox"
                  checked={a().serverFeatures}
                />
                {c().granted}
              </label>
              <label>
                {c().quota}
                <input
                  data-control-id="admin.account.quota"
                  name="quotaMiB"
                  type="number"
                  min="0"
                  max="1048576"
                  step="1"
                  required
                  value={a().quotaMiB}
                />
              </label>
              <ConfirmField t={app.t} />
              <button
                data-control-id="admin.account.entitlements"
                class="secondary"
                disabled={disabled()}
              >
                {c().saveEntitlement}
              </button>
            </form>
          </Show>
          <Show when={ready() && app.can('roles.manage') && a().role === 'administrator'}>
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
              <ConfirmField t={app.t} />
              <button
                data-control-id="admin.account.delegate"
                class="secondary"
                disabled={disabled()}
              >
                {c().saveDelegation}
              </button>
            </form>
          </Show>
          <Show when={app.can('accounts.sessions.revoke') && a().id !== app.account()?.id}>
            <form onSubmit={(e) => submit(e, 'sessions/revoke', () => ({}))}>
              <ConfirmField t={app.t} />
              <button
                data-control-id="admin.account.revoke"
                class="secondary"
                disabled={disabled()}
              >
                {app.t('revokeAll')}
              </button>
            </form>
          </Show>
          <Show when={app.account()?.role === 'superuser' && a().id !== app.account()?.id}>
            <AccountDeletion
              path={'/admin/accounts/' + a().id}
              pending={a().state === 'pending_deletion'}
              onChange={props.refresh}
            />
          </Show>
        </div>
      </details>
    </li>
  );
}
