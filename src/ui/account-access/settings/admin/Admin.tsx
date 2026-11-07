import { createResource, createSignal, For, Show } from 'solid-js';
import { PasswordField } from '../../password-field/PasswordField';
import { settingsCopy } from '../constants';
import type { AccountPage, Operations, SettingsProps } from '../types';
import { AccountRow } from '../account-row/AccountRow';

export function Admin(props: SettingsProps) {
  const c = () => settingsCopy[props.model.lang()];
  const [query, setQuery] = createSignal({ prefix: '', history: [''] });
  const [page, { refetch: reload }] = createResource(
    () => props.model.can('accounts.view') && query(),
    (q) =>
      props.model.read<AccountPage>(
        '/admin/accounts?' + new URLSearchParams({ q: q.prefix, after: q.history.at(-1) ?? '' }),
      ),
  );
  const [ops, { refetch: refreshOps }] = createResource(
    () => props.model.can('operations.view'),
    () => props.model.read<Operations>('/admin/operations'),
  );
  const refresh = () => {
    void reload();
    void refreshOps();
  };
  return (
    <Show when={props.model.canAdmin()} fallback={<p>{c().noAccess}</p>}>
      <Show when={props.model.can('accounts.view')}>
        <section class="admin-section">
          <h2>{c().accounts}</h2>
          <form
            class="admin-search"
            onSubmit={(e) => {
              e.preventDefault();
              setQuery({
                prefix: String(new FormData(e.currentTarget).get('q') ?? ''),
                history: [''],
              });
            }}
          >
            <label>
              {c().searchLabel}
              <input data-control-id="admin.search.query" name="q" type="search" maxlength={254} />
            </label>
            <button data-control-id="admin.search">{c().search}</button>
          </form>
          <form
            class="admin-search"
            onSubmit={(e) => props.model.submit(e, 'confirm', 'confirmed')}
          >
            <PasswordField t={props.model.t} kind="currentPassword" />
            <button data-control-id="admin.confirm" disabled={props.model.busy()}>
              {props.model.t('confirmPassword')}
            </button>
          </form>
          <p class="field-help">{c().adminPasswordHelp}</p>
          <Show when={page.loading}>
            <p role="status">{props.model.t('working')}</p>
          </Show>
          <Show when={!page.loading && page()}>
            {(data) => (
              <>
                <ul class="admin-list">
                  <For each={data().accounts} fallback={<li>{c().empty}</li>}>
                    {(account) => (
                      <AccountRow model={props.model} account={account} refresh={refresh} />
                    )}
                  </For>
                </ul>
                <div class="admin-actions">
                  <Show when={query().history.length > 1}>
                    <button
                      data-control-id="admin.previous"
                      class="secondary"
                      onClick={() => setQuery((q) => ({ ...q, history: q.history.slice(0, -1) }))}
                    >
                      {c().previous}
                    </button>
                  </Show>
                  <Show when={data().next}>
                    {(next) => (
                      <button
                        data-control-id="admin.next"
                        class="secondary"
                        onClick={() => setQuery((q) => ({ ...q, history: [...q.history, next()] }))}
                      >
                        {c().next}
                      </button>
                    )}
                  </Show>
                </div>
              </>
            )}
          </Show>
        </section>
      </Show>
      <Show when={props.model.can('operations.view')}>
        <section class="admin-section">
          <h2>{c().mail}</h2>
          <button
            data-control-id="admin.operations.refresh"
            class="secondary"
            disabled={ops.loading}
            onClick={() => void refreshOps()}
          >
            {c().refreshOperations}
          </button>
          <Show when={ops.loading}>
            <p role="status">{props.model.t('working')}</p>
          </Show>
          <Show when={ops()}>
            {(data) => (
              <>
                <dl class="admin-metrics">
                  <For each={['pending', 'sent', 'failed'] as const}>
                    {(status) => (
                      <div>
                        <dt>{c()[status]}</dt>
                        <dd>{data().mail[status].toLocaleString(props.model.lang())}</dd>
                      </div>
                    )}
                  </For>
                </dl>
                <details>
                  <summary data-control-id="admin.operations.mail">{c().mailJobs}</summary>
                  <ul class="admin-list">
                    <For each={data().jobs} fallback={<li>{c().noMail}</li>}>
                      {(job) => (
                        <li>
                          <strong>{c()[job.status]}</strong>
                          {' · '}
                          <time datetime={job.at}>
                            {new Date(job.at).toLocaleString(props.model.lang())}
                          </time>
                          <div class="field-help">
                            {c().attempts}: {job.attempts.toLocaleString(props.model.lang())} ·{' '}
                            {job.id}
                          </div>
                        </li>
                      )}
                    </For>
                  </ul>
                </details>
                <h2>{c().audit}</h2>
                <p class="field-help">{c().auditHelp}</p>
                <ul class="admin-list">
                  <For each={data().audit} fallback={<li>{c().none}</li>}>
                    {(event) => (
                      <li>
                        <strong>{c()[event.action]}</strong>
                        {' · '}
                        <time datetime={event.at}>
                          {new Date(event.at).toLocaleString(props.model.lang())}
                        </time>
                        <div class="field-help">
                          {c().actor}: {event.actorId} · {c().subject}: {event.subjectId}
                        </div>
                      </li>
                    )}
                  </For>
                </ul>
              </>
            )}
          </Show>
        </section>
      </Show>
    </Show>
  );
}
