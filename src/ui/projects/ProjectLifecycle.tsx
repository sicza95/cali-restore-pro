import { createMemo, createSignal, For, Show } from 'solid-js';
import { useApp } from '../app-context/AppContext';
import type { DeletionStatus } from '../../platform/api/types.gen';
import { deletionCopy } from '../settings/profile/deletion-copy';
import { lifecycleCopy } from './lifecycle-copy';

export function ProjectLifecycle(props: {
  project?: string;
  /** Name of a project this device still holds; hosted names are unreadable on the server. */
  localName?: (id: string) => string | undefined;
}) {
  const app = useApp();
  const [trash, setTrash] = createSignal<DeletionStatus[]>();
  const [notice, setNotice] = createSignal<DeletionStatus>();
  const l = () => lifecycleCopy[app.lang()];
  const refresh = async () => {
    setTrash(await app.read<DeletionStatus[]>('/hosted-project-trash'));
  };
  const change = async (project: string, action: 'delete' | 'recover' | 'purge') => {
    const result = await app.run(
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
      (entry) => props.localName?.(entry.id) || l().unknownProject(++unknown),
    );
  });
  const someUnknown = () => (trash() ?? []).some((entry) => !props.localName?.(entry.id));
  const date = (iso: string) =>
    new Intl.DateTimeFormat(app.lang(), { dateStyle: 'long', timeStyle: 'short' }).format(
      new Date(iso),
    );
  const deadlines = (entry: DeletionStatus) =>
    `${deletionCopy[app.lang()].recoverUntil} ${date(entry.recoverUntil)}. ` +
    `${deletionCopy[app.lang()].backupsExpire} ${date(entry.backupExpiresAt)}.`;
  return (
    <details class="project-pane">
      <summary data-control-id="project.trash.open">
        {props.project ? l().deleteTitle : l().trashTitle}
      </summary>
      <Show
        when={props.project}
        fallback={
          <>
            <button
              data-control-id="project.trash.refresh"
              class="secondary"
              disabled={app.busy()}
              onClick={() => void refresh()}
            >
              {l().refresh}
            </button>
            <Show when={trash()}>
              {(entries) => (
                <ul class="project-register">
                  <For each={entries()} fallback={<li>{l().empty}</li>}>
                    {(entry, index) => (
                      <li>
                        <div>
                          <a href={'/projects/' + entry.id}>{labels()[index()]}</a>
                          <p>{deadlines(entry)}</p>
                          <button
                            data-control-id="project.trash.restore"
                            class="secondary"
                            disabled={app.busy() || Date.parse(entry.recoverUntil) <= Date.now()}
                            onClick={() => void change(entry.id, 'recover')}
                          >
                            {l().recover}
                          </button>
                          <button
                            data-control-id="project.trash.purge"
                            class="secondary"
                            disabled={app.busy() || Date.parse(entry.recoverUntil) <= Date.now()}
                            onClick={() => {
                              if (window.confirm(l().confirmPurge)) void change(entry.id, 'purge');
                            }}
                          >
                            {l().purge}
                          </button>
                        </div>
                      </li>
                    )}
                  </For>
                </ul>
              )}
            </Show>
            <Show when={someUnknown()}>
              <p>{l().numbered}</p>
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
            <p>{l().deleteHelp}</p>
            <label class="confirmation">
              <input type="checkbox" required />
              {l().confirmDelete}
            </label>
            <label class="confirmation">
              <input type="checkbox" name="purge" />
              {l().skipRecovery}
            </label>
            <button data-control-id="project.trash.delete" class="secondary" disabled={app.busy()}>
              {l().delete}
            </button>
          </form>
        )}
      </Show>
      <Show when={notice()}>{(entry) => <p role="status">{deadlines(entry())}</p>}</Show>
    </details>
  );
}
