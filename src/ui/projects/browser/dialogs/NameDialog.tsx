import { createSignal, createUniqueId, Show } from 'solid-js';
import { browserCopy } from '../browser-copy';
import type { NameDialogProps } from '../types';
import { DialogShell } from './DialogShell';

export function NewNameDialog(props: NameDialogProps) {
  return <NameDialog {...props} mode="new" />;
}
export function RenameDialog(props: NameDialogProps) {
  return <NameDialog {...props} mode="rename" />;
}

function NameDialog(props: NameDialogProps & { mode: 'new' | 'rename' }) {
  const copy = () => browserCopy[props.language];
  const [name, setName] = createSignal(props.initialName ?? '');
  const [submitted, setSubmitted] = createSignal(false);
  const id = createUniqueId();
  const validation = () =>
    !name().trim()
      ? copy().nameRequired
      : name().trim().length > 120
        ? copy().nameLimit
        : undefined;
  const error = () => props.error ?? (submitted() ? validation() : undefined);
  return (
    <DialogShell
      title={
        props.mode === 'new'
          ? copy().newItem[props.level]
          : copy().renameTitle(copy().kinds[props.level])
      }
      closeLabel={copy().close}
      onClose={props.onClose}
    >
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          setSubmitted(true);
          if (!props.busy && !validation()) props.onConfirm(name().trim());
        }}
      >
        <label class="browser-name-label" for={id}>
          {copy().name}
        </label>
        <input
          id={id}
          class="browser-name-input"
          value={name()}
          maxlength={120}
          autofocus
          data-control-id="browser.dialog.name"
          aria-invalid={!!error()}
          aria-describedby={error() ? `${id}-error` : undefined}
          onInput={(event) => setName(event.currentTarget.value)}
        />
        <Show when={error()}>
          <p id={`${id}-error`} class="browser-diagnostics" role="alert">
            {error()}
          </p>
        </Show>
        <div class="cr-dialog-actions">
          <button
            type="button"
            class="cr-button"
            data-control-id="browser.dialog.cancel"
            onClick={() => props.onClose()}
          >
            {copy().cancel}
          </button>
          <button
            type="submit"
            class="cr-button cr-button--primary"
            data-control-id="browser.dialog.confirm"
            disabled={props.busy}
          >
            {props.busy ? copy().working : props.mode === 'new' ? copy().create : copy().save}
          </button>
        </div>
      </form>
    </DialogShell>
  );
}
