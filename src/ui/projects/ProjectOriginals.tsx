import { checkpointSources } from '../../platform/projects/assessment-checkpoints';
import type { PendingAttachment } from '../../platform/vault/project-store';
import { createResource, createSignal, For, onCleanup, Show, untrack } from 'solid-js';
import { ImageImportError } from '../../platform/images/types';
import type { ImportIssue } from '../../platform/images/types';
import type { Attachment, ImageRole, Surface } from '../../platform/projects/types';
import type { LocalVault } from '../../platform/vault/vault';
import type { Copy } from './forms';
import { formatFileSize } from '../../platform/format/number';
import type { Language } from '../account-access/types';

export function ProjectOriginals(props: {
  project: string;
  surface: Surface;
  copy: Copy;
  language: Language;
  vault: LocalVault;
  busy: boolean;
  pendingSource?: string;
  onRun: (task: () => Promise<void>) => Promise<boolean>;
  onSave: (images: Attachment[], attachment?: PendingAttachment) => Promise<void>;
}) {
  const files = untrack(() => props.vault.files());
  const [transfer, setTransfer] = createSignal<AbortController>();
  const [progress, setProgress] = createSignal(0);
  const [issue, setIssue] = createSignal<ImportIssue>();
  onCleanup(() => transfer()?.abort());

  return (
    <section class="project-pane project-originals">
      <h2>{props.copy.originals}</h2>
      <form
        class="project-fields"
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const fields = new FormData(form);
          const file = fields.get('file');
          if (!(file instanceof File) || !file.size) return;
          const role = fields.get('role') as ImageRole;
          void props.onRun(async () => {
            const controller = new AbortController();
            setIssue(undefined);
            setProgress(0);
            setTransfer(controller);
            try {
              const project = props.project;
              const images = props.surface.images;
              const save = props.onSave;
              await files.importImage(
                project,
                file,
                async (ref, signal) => {
                  await save([...images, { id: ref.id, role }], { id: ref.id, signal });
                },
                { signal: controller.signal, progress: setProgress },
              );
              form.reset();
            } catch (error) {
              if (!controller.signal.aborted) {
                if (error instanceof ImageImportError) setIssue(error.code);
                else throw error;
              }
            } finally {
              setTransfer(undefined);
            }
          });
        }}
      >
        <label>
          {props.copy.file}
          <input
            data-control-id="originals.file"
            name="file"
            type="file"
            accept=".jpg,.jpeg,.png,.tif,.tiff,.heic,.heif,.dng,.cr2,.cr3,.webp,.avif"
            onChange={() => setIssue(undefined)}
            required
            disabled={props.busy}
          />
        </label>
        <label>
          {props.copy.role}
          <RoleField copy={props.copy} />
        </label>
        <button data-control-id="originals.attach" disabled={props.busy}>
          {props.copy.attach}
        </button>
      </form>
      <Show when={issue()}>{(code) => <p role="alert">{props.copy.imageImport[code()]}</p>}</Show>
      <Show when={transfer()}>
        <div class="project-fields">
          <progress aria-label={props.copy.attach} max={1} value={progress()} />
          <button data-control-id="originals.cancel" onClick={() => transfer()?.abort()}>
            {props.copy.cancel}
          </button>
        </div>
      </Show>
      <ul class="project-register">
        <For each={props.surface.images} fallback={<li>{props.copy.noFiles}</li>}>
          {(image) => {
            const ref = { project: props.project, id: image.id };
            const draftSource = () => props.pendingSource === image.id;
            const checkpointPhoto = () =>
              props.surface.checkpoints?.some(({ assessment }) =>
                checkpointSources(assessment).some(({ id }) => id === image.id),
              );
            const [metadata] = createResource(() => files.metadata(ref).catch(() => null));
            return (
              <li>
                <span>
                  {metadata.loading ? '…' : (metadata()?.name ?? props.copy.unavailable)}
                  <Show when={metadata()}>
                    {(info) => (
                      <small>
                        {formatFileSize(info().size, props.language)}
                        {info().type ? ' · ' + info().type : ''}
                      </small>
                    )}
                  </Show>
                </span>
                <label>
                  {props.copy.role}
                  <RoleField
                    copy={props.copy}
                    value={image.role}
                    disabled={props.busy || draftSource()}
                    reason={draftSource() ? props.copy.draftPhoto : undefined}
                    change={(role) =>
                      void props.onRun(() =>
                        props.onSave(
                          props.surface.images.map((a) => (a.id === image.id ? { ...a, role } : a)),
                        ),
                      )
                    }
                  />
                </label>
                <button
                  data-control-id="originals.remove"
                  disabled={props.busy || checkpointPhoto() || draftSource()}
                  title={
                    draftSource()
                      ? props.copy.draftPhoto
                      : checkpointPhoto()
                        ? props.copy.checkpointPhoto
                        : undefined
                  }
                  onClick={() =>
                    void props.onRun(async () => {
                      await props.onSave(props.surface.images.filter((a) => a.id !== image.id));
                      if (metadata()) await files.removeLocal(ref);
                    })
                  }
                >
                  {props.copy.remove}
                </button>
              </li>
            );
          }}
        </For>
      </ul>
    </section>
  );
}

function RoleField(props: {
  copy: Copy;
  value?: ImageRole;
  disabled?: boolean;
  /** Why the select is disabled, as "Remove" says it. */
  reason?: string;
  change?: (role: ImageRole) => void;
}) {
  return (
    <select
      data-control-id={props.change ? 'originals.change-role' : 'originals.role'}
      name="role"
      value={props.value ?? 'mapping'}
      disabled={props.disabled}
      title={props.reason}
      onChange={(e) => {
        const role = e.currentTarget.value as ImageRole;
        if (props.change) {
          e.currentTarget.value = props.value ?? 'mapping';
          props.change(role);
        }
      }}
    >
      <option value="mapping">{props.copy.mapping}</option>
      <option value="reference">{props.copy.reference}</option>
    </select>
  );
}
