import { createMemo, createSignal, For, Show } from 'solid-js';
import type { SettingsModel } from '../settings/types';
import type { DeletionStatus } from '../../../platform/api/types.gen';

export function ProjectLifecycle(props: {
  model: SettingsModel;
  project?: string;
  /** Name of a project this device still holds; hosted names are unreadable on the server. */
  localName?: (id: string) => string | undefined;
}) {
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
  const labels = createMemo(() => {
    let unknown = 0;
    return (trash() ?? []).map(
      (entry) =>
        props.localName?.(entry.id) || (hu() ? 'Törölt projekt ' : 'Deleted project ') + ++unknown,
    );
  });
  const someUnknown = () => (trash() ?? []).some((entry) => !props.localName?.(entry.id));
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
      <summary data-control-id="project.trash.open">
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
            <button
              data-control-id="project.trash.refresh"
              class="secondary"
              disabled={props.model.busy()}
              onClick={() => void refresh()}
            >
              {hu() ? 'Kuka frissítése' : 'Refresh trash'}
            </button>
            <Show when={trash()}>
              {(entries) => (
                <ul class="project-register">
                  <For
                    each={entries()}
                    fallback={<li>{hu() ? 'A kuka üres.' : 'Trash is empty.'}</li>}
                  >
                    {(entry, index) => (
                      <li>
                        <div>
                          <a href={'/projects/' + entry.id}>{labels()[index()]}</a>
                          <p>{deadlines(entry)}</p>
                          <button
                            data-control-id="project.trash.restore"
                            class="secondary"
                            disabled={
                              props.model.busy() || Date.parse(entry.recoverUntil) <= Date.now()
                            }
                            onClick={() => void change(entry.id, 'recover')}
                          >
                            {hu() ? 'Helyreállítás' : 'Recover'}
                          </button>
                          <button
                            data-control-id="project.trash.purge"
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
            <Show when={someUnknown()}>
              <p>
                {hu()
                  ? 'Az ezen az eszközön nem tárolt projektek sorszámot kapnak.'
                  : 'Projects that aren’t on this device are numbered.'}
              </p>
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
            <button
              data-control-id="project.trash.delete"
              class="secondary"
              disabled={props.model.busy()}
            >
              {hu() ? 'Törlés' : 'Delete hosted project'}
            </button>
          </form>
        )}
      </Show>
      <Show when={notice()}>{(entry) => <p role="status">{deadlines(entry())}</p>}</Show>
    </details>
  );
}
