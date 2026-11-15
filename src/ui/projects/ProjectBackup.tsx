import { createSignal, onCleanup, Show } from 'solid-js';
import type { SavedProject } from '../../platform/projects/types';
import { BackupUnavailable } from '../../platform/vault/project-backups';
import type { LocalVault } from '../../platform/vault/vault';
import type { Language } from '../account-access/types';
import { projectCopy } from './project-copy';
import { backupCopy as copy } from './backup-copy';

type Props = {
  vault: LocalVault;
  language: Language;
  busy: boolean;
  run: (task: () => Promise<void>) => Promise<boolean>;
} & (
  | { project: string; onRestored?: never }
  | { project?: never; onRestored: (project: SavedProject) => void }
);

export function ProjectBackup(props: Props) {
  const c = () => copy[props.language];
  const action = () => (props.project ? c().export : c().import);
  const [transfer, setTransfer] = createSignal<AbortController>();
  const [progress, setProgress] = createSignal(0);
  const [error, setError] = createSignal('');
  const [cancelled, setCancelled] = createSignal(false);
  const [download, setDownload] = createSignal<{ url: string; code: string }>();
  const [saved, setSaved] = createSignal(false);
  const [gap, setGap] = createSignal(false);

  /** Says up front when the project holds something a backup can't carry yet. */
  async function checkGap() {
    if (!props.project) return;
    try {
      setGap(!!(await props.vault.projectBackups().gap(props.project)));
    } catch {
      setGap(false);
    }
  }

  function clearDownload() {
    const result = download();
    if (result) URL.revokeObjectURL(result.url);
    setDownload(undefined);
    setSaved(false);
  }

  onCleanup(() => {
    transfer()?.abort();
    clearDownload();
  });

  function execute(
    work: (options: { signal: AbortSignal; progress: (value: number) => void }) => Promise<void>,
  ) {
    void props.run(async () => {
      const controller = new AbortController();
      setTransfer(controller);
      setProgress(0);
      setError('');
      setCancelled(false);
      clearDownload();
      try {
        await work({ signal: controller.signal, progress: setProgress });
      } catch (error) {
        if (controller.signal.aborted) setCancelled(true);
        else if (error instanceof BackupUnavailable) setGap(true);
        else setError(props.project ? c().exportFailed : c().importFailed);
      } finally {
        setTransfer(undefined);
      }
    });
  }

  return (
    <details
      class="project-backup"
      onToggle={(event) => {
        if (event.currentTarget.open) void checkGap();
        else {
          transfer()?.abort();
          clearDownload();
        }
      }}
    >
      <summary data-control-id={props.project ? 'project.backup' : 'projects.restore'}>
        {action()}
      </summary>
      <Show
        when={props.project}
        fallback={
          <form
            class="project-fields"
            onSubmit={(event) => {
              event.preventDefault();
              const form = event.currentTarget;
              const fields = new FormData(form);
              const file = fields.get('archive');
              if (!(file instanceof File)) return;
              const code = String(fields.get('backup-key') ?? '');
              execute(async (options) => {
                const project = await props.vault.projectBackups().import(file, code, options);
                form.reset();
                props.onRestored?.(project);
              });
            }}
          >
            <label>
              {c().file}
              <input
                type="file"
                name="archive"
                accept=".crproject"
                required
                disabled={props.busy}
              />
            </label>
            <label>
              {c().key}
              <input
                name="backup-key"
                type="password"
                autocomplete="off"
                required
                disabled={props.busy}
              />
            </label>
            <button data-control-id="backup.restore" class="secondary" disabled={props.busy}>
              {c().restore}
            </button>
          </form>
        }
      >
        {(id) => (
          <button
            data-control-id="backup.export"
            class="secondary"
            disabled={props.busy || gap()}
            aria-describedby={gap() ? 'project-backup-gap' : undefined}
            onClick={() =>
              execute(async (options) => {
                const { blob, code } = await props.vault.projectBackups().export(id(), options);
                options.signal.throwIfAborted();
                setDownload({ url: URL.createObjectURL(blob), code });
              })
            }
          >
            {c().prepare}
          </button>
        )}
      </Show>
      <Show when={transfer()}>
        <div class="project-fields">
          <progress aria-label={action()} max={1} value={progress()} />
          <button
            data-control-id="backup.cancel"
            class="secondary"
            onClick={() => transfer()?.abort()}
          >
            {projectCopy[props.language].cancel}
          </button>
        </div>
      </Show>
      <Show when={download()}>
        {(result) => (
          <div class="project-backup-result">
            <p role="status">{c().keep}</p>
            <label>
              {c().key}
              <textarea
                class="project-key-code"
                readOnly
                rows={2}
                value={result().code}
                spellcheck={false}
              />
            </label>
            <label class="confirmation">
              <input
                type="checkbox"
                checked={saved()}
                onChange={(event) => setSaved(event.currentTarget.checked)}
              />
              {c().saved}
            </label>
            <Show when={saved()}>
              <a download="calirestore-project.crproject" href={result().url}>
                {c().download}
              </a>
            </Show>
          </div>
        )}
      </Show>
      <Show when={gap()}>
        <p id="project-backup-gap" class="field-help" role="status">
          {c().gap}
        </p>
      </Show>
      <Show when={error()}>
        <p role="alert">{error()}</p>
      </Show>
      <Show when={cancelled()}>
        <p role="status">{c().cancelled}</p>
      </Show>
    </details>
  );
}
