import { createSignal, For, Show } from 'solid-js';
import type { SettingsModel } from '../settings/types';
import type { DeletionStatus } from '../../../platform/api/types.gen';

export function ProjectLifecycle(props: { model: SettingsModel; project?: string }) {
  const [trash, setTrash] = createSignal<DeletionStatus[]>();
  const [notice, setNotice] = createSignal<DeletionStatus>();
  const hu = () => props.model.lang() === 'hu';
  const refresh = async () => {
    setTrash(await props.model.read<DeletionStatus[]>('/hosted-project-trash'));
  };
  const change = async (project: string, action: 'delete' | 'recover' | 'purge') => {
    const result = await props.model.run(
      '/hosted-projects/' + project + '/deletion',
      { action, confirm: true },
      'success',
    );
    if (!result) return;
    if (result.recoverUntil && result.backupExpiresAt) {
      setNotice({
        id: project,
        recoverUntil: result.recoverUntil,
        backupExpiresAt: result.backupExpiresAt,
      });
    }
    if (!props.project) await refresh();
  };
  const date = (iso: string) =>
    new Intl.DateTimeFormat(props.model.lang(), { dateStyle: 'long', timeStyle: 'short' }).format(
      new Date(iso),
    );
  const deadlines = (entry: DeletionStatus) =>
    (hu() ? 'Helyreállítási határidő ' : 'Live recovery deadline ') +
    date(entry.recoverUntil) +
    (hu() ? '. Szervermentések lejárata legkésőbb ' : '. Operational backups expire by ') +
    date(entry.backupExpiresAt) +
    '.';
  return (
    <details class="project-pane">
      <summary>
        {props.project
          ? hu()
            ? 'Szerverprojekt törlése'
            : 'Delete hosted project'
          : hu()
            ? 'Törölt szerverprojektek'
            : 'Hosted project trash'}
      </summary>
      <Show
        when={props.project}
        fallback={
          <>
            <button class="secondary" disabled={props.model.busy()} onClick={() => void refresh()}>
              {hu() ? 'Kuka frissítése' : 'Refresh trash'}
            </button>
            <Show when={trash()}>
              {(entries) => (
                <ul class="project-register">
                  <For
                    each={entries()}
                    fallback={<li>{hu() ? 'A kuka üres.' : 'Trash is empty.'}</li>}
                  >
                    {(entry) => (
                      <li>
                        <div>
                          <a href={'/projects/' + entry.id}>{entry.id}</a>
                          <p>{deadlines(entry)}</p>
                          <button
                            class="secondary"
                            disabled={
                              props.model.busy() || Date.parse(entry.recoverUntil) <= Date.now()
                            }
                            onClick={() => void change(entry.id, 'recover')}
                          >
                            {hu() ? 'Helyreállítás' : 'Recover'}
                          </button>
                          <button
                            class="secondary"
                            disabled={
                              props.model.busy() || Date.parse(entry.recoverUntil) <= Date.now()
                            }
                            onClick={() => {
                              if (
                                window.confirm(
                                  hu()
                                    ? 'Kihagyja a helyreállítási időszakot?'
                                    : 'Skip live recovery and queue purge?',
                                )
                              )
                                void change(entry.id, 'purge');
                            }}
                          >
                            {hu() ? 'Végleges törlés' : 'Queue live purge'}
                          </button>
                        </div>
                      </li>
                    )}
                  </For>
                </ul>
              )}
            </Show>
          </>
        }
      >
        {(project) => (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const action = new FormData(event.currentTarget).has('purge') ? 'purge' : 'delete';
              void change(project(), action);
            }}
          >
            <p>
              {hu()
                ? 'A szerverprojekt 30 napig helyreállítható. A helyi másolatok és a saját exportált mentések megmaradnak.'
                : 'The hosted project can be recovered for 30 days. Local copies and your exported backups remain available.'}
            </p>
            <label class="confirmation">
              <input type="checkbox" required />
              {hu()
                ? 'Megerősítem a szerverprojekt törlését.'
                : 'I confirm deletion of the hosted project.'}
            </label>
            <label class="confirmation">
              <input type="checkbox" name="purge" />
              {hu() ? 'A helyreállítási időszak kihagyása' : 'Skip live recovery and queue purge'}
            </label>
            <button class="secondary" disabled={props.model.busy()}>
              {hu() ? 'Törlés' : 'Delete hosted project'}
            </button>
          </form>
        )}
      </Show>
      <Show when={notice()}>{(entry) => <p role="status">{deadlines(entry())}</p>}</Show>
    </details>
  );
}
