import { DialogItem } from './DialogItem';
import { createUniqueId, Show } from 'solid-js';
import { browserCopy } from '../browser-copy';
import type { DeleteDialogProps } from '../types';
import { DialogShell } from './DialogShell';

export function DeleteDialog(props: DeleteDialogProps) {
  const copy = () => browserCopy[props.language];
  const id = createUniqueId();
  const count = (value: number | null) => (value === null ? copy().unknown : String(value));
  const permanent = () => props.item.kind !== 'project' || !!props.permanent;
  return (
    <DialogShell
      title={copy().delete}
      sidebar={
        <DialogItem
          language={props.language}
          kind={props.item.kind}
          name={props.item.name}
          preview={props.preview}
        >
          <p>
            {props.item.kind !== 'project'
              ? copy().childDeleteHelp
              : props.permanent
                ? copy().localProjectDeleteHelp
                : copy().projectDeleteHelp}
          </p>
        </DialogItem>
      }
      closeLabel={copy().close}
      onClose={props.onClose}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!props.busy && !props.blockedReason) props.onConfirm();
        }}
      >
        <p>
          {copy().descendantCounts(
            count(props.descendants.objects),
            count(props.descendants.surfaces),
          )}
        </p>
        <Show when={permanent()}>
          <p>
            <strong>{copy().cannotUndo}</strong>
          </p>
        </Show>
        <Show when={props.blockedReason}>
          <p id={id} class="browser-diagnostics">
            {props.blockedReason}
          </p>
        </Show>
        <Show when={props.error}>
          <p role="alert" class="browser-diagnostics">
            {props.error}
          </p>
        </Show>
        <div class="cr-dialog-actions">
          <button
            type="button"
            autofocus
            class="cr-button"
            data-control-id="browser.dialog.cancel"
            onClick={() => props.onClose()}
          >
            {copy().cancel}
          </button>
          <button
            type="submit"
            class="cr-button cr-button--danger"
            aria-disabled={!!props.blockedReason}
            aria-describedby={props.blockedReason ? id : undefined}
            title={props.blockedReason}
            disabled={props.busy}
            data-control-id="browser.dialog.confirm"
          >
            {props.busy ? copy().working : permanent() ? copy().delete : copy().trash}
          </button>
        </div>
      </form>
    </DialogShell>
  );
}
