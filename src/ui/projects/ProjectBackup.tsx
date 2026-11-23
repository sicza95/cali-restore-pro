import { createSignal, onCleanup, Show } from 'solid-js';
import type { SavedProject } from '../../platform/projects/types';
import { plaintextCode } from '../../platform/vault/aead';
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
  const [download, setDownload] = createSignal<string>();

  function clearDownload() {
    const url = download();
    if (url) URL.revokeObjectURL(url);
    setDownload(undefined);
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
      } catch {
        if (controller.signal.aborted) setCancelled(true);
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
        if (!event.currentTarget.open) {
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
              execute(async (options) => {
                // No backup key while encryption is off (aead.ts).
                const project = await props.vault
                  .projectBackups()
                  .import(file, plaintextCode, options);
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
            <button data-control-id="backup.restore" disabled={props.busy}>
              {c().restore}
            </button>
          </form>
        }
      >
        {(id) => (
          <button
            data-control-id="backup.export"
            disabled={props.busy}
            onClick={() =>
              execute(async (options) => {
                const { blob } = await props.vault.projectBackups().export(id(), options);
                options.signal.throwIfAborted();
                setDownload(URL.createObjectURL(blob));
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
          <button data-control-id="backup.cancel" onClick={() => transfer()?.abort()}>
            {projectCopy[props.language].cancel}
          </button>
        </div>
      </Show>
      <Show when={download()}>
        {(url) => (
          <div class="project-backup-result">
            <a download="calirestore-project.crproject" href={url()}>
              {c().download}
            </a>
          </div>
        )}
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
