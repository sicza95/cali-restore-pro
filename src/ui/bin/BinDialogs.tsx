import { Show } from 'solid-js';
import type { Language } from '../../platform/i18n/language';
import { formatFileSize } from '../../platform/format/number';
import { DialogItem } from '../projects/browser/dialogs/DialogItem';
import { DialogShell } from '../projects/browser/dialogs/DialogShell';
import { binCopy } from './bin-copy';
import { pathText, type BinRow } from './utils';

const date = (language: Language, value: number) =>
  new Intl.DateTimeFormat(language, { dateStyle: 'long', timeStyle: 'short' }).format(value);

/** Read-only details: no editing, renaming or thumbnail controls. */
export function BinInfoDialog(props: {
  language: Language;
  row: BinRow;
  size?: number;
  onClose: () => void;
}) {
  const copy = () => binCopy[props.language];
  const counts = () => props.row.entry.counts;
  return (
    <DialogShell
      title={copy().info}
      closeLabel={copy().close}
      onClose={props.onClose}
      sidebar={
        <DialogItem
          language={props.language}
          kind={props.row.entry.entity.kind}
          name={props.row.name}
        />
      }
    >
      <dl class="bin-info">
        <dt>{copy().type}</dt>
        <dd>{copy().kinds[props.row.entry.entity.kind]}</dd>
        <dt>{copy().originalPath}</dt>
        <dd>{pathText(copy(), props.row.path)}</dd>
        <dt>{copy().deletedAt}</dt>
        <dd>{date(props.language, props.row.entry.deletedAt)}</dd>
        <dt>{copy().recoverUntil}</dt>
        <dd>{date(props.language, props.row.entry.recoverUntil)}</dd>
        <dt>{copy().availability}</dt>
        <dd>{props.row.state === 'expired' ? copy().expired : copy().recoverable}</dd>
        <Show when={props.row.entry.entity.kind !== 'surface'}>
          <dt>{copy().contentsLabel}</dt>
          <dd>{copy().contents(counts().objects, counts().surfaces, counts().photos)}</dd>
        </Show>
        <Show when={props.size !== undefined}>
          <dt>{copy().size}</dt>
          <dd title={`${props.size} B`}>
            {formatFileSize(props.size!, props.language)}
            <small>{copy().sizeHelp}</small>
          </dd>
        </Show>
      </dl>
      <div class="cr-dialog-actions">
        <button
          type="button"
          autofocus
          class="cr-button"
          data-control-id="bin.info.close"
          onClick={() => props.onClose()}
        >
          {copy().close}
        </button>
      </div>
    </DialogShell>
  );
}

/** Irreversible: names the item, the cascade and uses the danger action. */
export function BinPurgeDialog(props: {
  language: Language;
  row: BinRow;
  cascade: number;
  busy: boolean;
  error?: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const copy = () => binCopy[props.language];
  return (
    <DialogShell
      title={copy().purgeTitle(props.row.name)}
      closeLabel={copy().close}
      onClose={props.onClose}
      sidebar={
        <DialogItem
          language={props.language}
          kind={props.row.entry.entity.kind}
          name={props.row.name}
        >
          <p>{copy().purgeHelp}</p>
        </DialogItem>
      }
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!props.busy) props.onConfirm();
        }}
      >
        <Show when={props.cascade > 0}>
          <p>{copy().purgeCascade(props.cascade)}</p>
        </Show>
        <p>
          <strong>{copy().cannotUndo}</strong>
        </p>
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
            data-control-id="bin.purge.cancel"
            onClick={() => props.onClose()}
          >
            {copy().cancel}
          </button>
          <button
            type="submit"
            class="cr-button cr-button--danger"
            disabled={props.busy}
            data-control-id="bin.purge.confirm"
          >
            {props.busy ? copy().working : copy().purge}
          </button>
        </div>
      </form>
    </DialogShell>
  );
}
