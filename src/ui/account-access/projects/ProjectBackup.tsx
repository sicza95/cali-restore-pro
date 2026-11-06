/* eslint-disable solid/reactivity -- Backup commands read the current project when invoked. */
import { createSignal, onCleanup, Show } from 'solid-js';
import type { SavedProject } from '../../../platform/projects/types';
import type { LocalVault } from '../../../platform/vault/vault';
import type { Language } from '../types';
import { projectCopy } from './project-copy';

const copy = {
  en: {
    export: 'Export encrypted backup',
    prepare: 'Prepare backup',
    download: 'Download backup',
    keep: 'Save this key separately from the backup file. You need both to restore the project.',
    saved: 'I saved the backup key',
    key: 'Backup key',
    import: 'Import encrypted backup',
    file: 'Backup file',
    restore: 'Restore as a local copy',
    exportFailed:
      'Backup could not be prepared. Check that all originals are available on this device and the backup fits within 512 MiB.',
    importFailed:
      'Restore failed. Check the backup key, try an intact backup file up to 512 MiB, and make sure this device has enough storage.',
    cancelled: 'Backup operation cancelled.',
  },
  hu: {
    export: 'Titkosított biztonsági mentés exportálása',
    prepare: 'Mentés előkészítése',
    download: 'Mentés letöltése',
    keep: 'A kulcsot a mentési fájltól külön tárolja. A projekt visszaállításához mindkettőre szükség van.',
    saved: 'Elmentettem a biztonsági mentés kulcsát',
    key: 'Biztonsági mentés kulcsa',
    import: 'Titkosított biztonsági mentés importálása',
    file: 'Biztonsági mentés fájlja',
    restore: 'Visszaállítás helyi másolatként',
    exportFailed:
      'Nem sikerült előkészíteni a mentést. Ellenőrizze, hogy minden eredeti fájl elérhető-e ezen az eszközön, és a mentés legfeljebb 512 MiB méretű-e.',
    importFailed:
      'A visszaállítás sikertelen. Ellenőrizze a mentési kulcsot, használjon sértetlen, legfeljebb 512 MiB-os mentést, és ellenőrizze a szabad tárhelyet.',
    cancelled: 'A biztonsági mentési művelet megszakadt.',
  },
};

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
            <button class="secondary" disabled={props.busy}>
              {c().restore}
            </button>
          </form>
        }
      >
        {(id) => (
          <button
            class="secondary"
            disabled={props.busy}
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
          <button class="secondary" onClick={() => transfer()?.abort()}>
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
      <Show when={error()}>
        <p role="alert">{error()}</p>
      </Show>
      <Show when={cancelled()}>
        <p role="status">{c().cancelled}</p>
      </Show>
    </details>
  );
}
