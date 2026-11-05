/* eslint-disable solid/reactivity -- Project commands are deferred event callbacks, not render effects. */
import { createResource, createSignal, For, onCleanup, Show, untrack } from 'solid-js';
import type { Attachment, ImageRole, Surface } from '../../../platform/projects/types';
import type { LocalVault } from '../../../platform/vault/vault';
import type { Copy } from './forms';

export function ProjectOriginals(props: {
  project: string;
  surface: Surface;
  copy: Copy;
  vault: LocalVault;
  busy: boolean;
  onRun: (task: () => Promise<void>) => Promise<boolean>;
  onSave: (images: Attachment[]) => Promise<void>;
}) {
  const files = untrack(() => props.vault.files());
  const [transfer, setTransfer] = createSignal<AbortController>();
  const [progress, setProgress] = createSignal(0);
  onCleanup(() => transfer()?.abort());

  return (
    <section class="project-pane project-originals">
      <h3>{props.copy.originals}</h3>
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
            setProgress(0);
            setTransfer(controller);
            try {
              const ref = await files.stage(props.project, file, {
                signal: controller.signal,
                progress: (done, total) => setProgress(done / total),
              });
              try {
                controller.signal.throwIfAborted();
                await props.onSave([...props.surface.images, { id: ref.id, role }]);
              } catch (error) {
                await files.removeLocal(ref).catch(() => undefined);
                throw error;
              }
              form.reset();
            } catch (error) {
              if (!controller.signal.aborted) throw error;
            } finally {
              setTransfer(undefined);
            }
          });
        }}
      >
        <label>
          {props.copy.file}
          <input name="file" type="file" required disabled={props.busy} />
        </label>
        <label>
          {props.copy.role}
          <RoleField copy={props.copy} />
        </label>
        <button disabled={props.busy}>{props.copy.attach}</button>
      </form>
      <Show when={transfer()}>
        <div class="project-fields">
          <progress aria-label={props.copy.attach} max={1} value={progress()} />
          <button class="secondary" onClick={() => transfer()?.abort()}>
            {props.copy.cancel}
          </button>
        </div>
      </Show>
      <ul class="project-register">
        <For each={props.surface.images} fallback={<li>{props.copy.noFiles}</li>}>
          {(image) => {
            const ref = { project: props.project, id: image.id };
            const [metadata] = createResource(() => files.metadata(ref).catch(() => null));
            return (
              <li>
                <span>
                  {metadata.loading ? '…' : (metadata()?.name ?? props.copy.unavailable)}
                  <Show when={metadata()}>
                    {(info) => (
                      <small>
                        {info().size.toLocaleString()} B{info().type ? ' · ' + info().type : ''}
                      </small>
                    )}
                  </Show>
                </span>
                <label>
                  {props.copy.role}
                  <RoleField
                    copy={props.copy}
                    value={image.role}
                    disabled={props.busy}
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
                  class="secondary"
                  disabled={props.busy}
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
  change?: (role: ImageRole) => void;
}) {
  return (
    <select
      name="role"
      value={props.value ?? 'mapping'}
      disabled={props.disabled}
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
