import { checkpointSources } from '../../platform/projects/assessment-checkpoints';
import { draftBlocks } from '../../platform/projects/surface-attachments';
import type { PendingAttachment } from '../../platform/vault/project-store';
import {
  createMemo,
  createResource,
  createSignal,
  createUniqueId,
  For,
  onCleanup,
  Show,
  untrack,
} from 'solid-js';
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
  /** The photos whose journal holds drawing drafts (#72, #75). */
  drafts?: ReadonlySet<string>;
  onRun: (task: () => Promise<void>) => Promise<boolean>;
  onSave: (images: Attachment[], attachment?: PendingAttachment) => Promise<void>;
}) {
  const files = untrack(() => props.vault.files());
  const [transfer, setTransfer] = createSignal<AbortController>();
  const [progress, setProgress] = createSignal(0);
  const [issue, setIssue] = createSignal<ImportIssue>();
  onCleanup(() => transfer()?.abort());
  const blocks = createMemo(() => draftBlocks(props.surface.images, props.drafts ?? new Set()));
  const ids = createUniqueId();

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
            const block = () => blocks().get(image.id);
            const checkpointPhoto = () =>
              props.surface.checkpoints?.some(({ assessment }) =>
                checkpointSources(assessment).some(({ id }) => id === image.id),
              );
            const roleReason = () => (block()?.role ? props.copy.draftPhoto : undefined);
            const removeReason = () => {
              const remove = block()?.remove;
              if (remove)
                return props.copy[remove === 'pending' ? 'draftPhoto' : 'hiddenDraftPhoto'];
              return checkpointPhoto() ? props.copy.checkpointPhoto : undefined;
            };
            // Each reason is shown once, and describes the controls it blocks (#79).
            const reasons = () =>
              [...new Set([roleReason(), removeReason()])].filter((r): r is string => !!r);
            const reasonId = (reason?: string) =>
              reason ? `${ids}-${image.id}-${reasons().indexOf(reason)}` : undefined;
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
                    disabled={props.busy || !!block()?.role}
                    describedBy={reasonId(roleReason())}
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
                  disabled={props.busy || checkpointPhoto() || !!block()?.remove}
                  aria-describedby={reasonId(removeReason())}
                  onClick={() =>
                    void props.onRun(async () => {
                      await props.onSave(props.surface.images.filter((a) => a.id !== image.id));
                      if (metadata()) await files.removeLocal(ref);
                    })
                  }
                >
                  {props.copy.remove}
                </button>
                <For each={reasons()}>
                  {(reason, index) => (
                    <p class="field-help" id={`${ids}-${image.id}-${index()}`}>
                      {reason}
                    </p>
                  )}
                </For>
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
  /** The id of the visible text saying why the select is disabled (#79). */
  describedBy?: string;
  change?: (role: ImageRole) => void;
}) {
  return (
    <select
      data-control-id={props.change ? 'originals.change-role' : 'originals.role'}
      name="role"
      value={props.value ?? 'mapping'}
      disabled={props.disabled}
      aria-describedby={props.describedBy}
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
