import { onCleanup, onMount, Show, untrack } from 'solid-js';
import { control, historyLimit } from './constants';
import type { DrawingCopy } from './copy';
import type { DrawingReview } from './createDrawingReview';
import { layerName } from './DrawingLayers';

export function DrawingHistory(props: {
  model: DrawingReview;
  copy: DrawingCopy;
  onCommit: () => void;
  onDiscard: () => void;
}) {
  const m = untrack(() => props.model);
  const c = () => props.copy;
  const entry = () => m.undoEntry() ?? m.redoEntry();
  const undoName = (redo: boolean) => {
    const action = redo ? c().redo : c().undo;
    if (m.draft()) {
      const mark = (redo ? m.draft()!.undone : m.draft()!.pending).at(-1);
      return `${action} · ${mark ? c()[mark.action] : c().draft} · ${layerName(m.layer(), c())}`;
    }
    const item = redo ? m.redoEntry() : m.undoEntry();
    if (!item) return action;
    return [action, c()[item.action], item.layer && layerName(item.layer, c())]
      .filter(Boolean)
      .join(' · ');
  };
  return (
    <section class="drawing-panel drawing-history" aria-label={c().history}>
      <h3>{c().history}</h3>
      <label>
        {c().modeLabel}
        <select
          data-control-id={control('history.mode')}
          value={m.manual() ? 'manual' : 'stroke'}
          onChange={(e) => m.setManual(e.currentTarget.value === 'manual')}
        >
          <option value="stroke">{c().perStroke}</option>
          <option value="manual">{c().manual}</option>
        </select>
      </label>
      <Show when={m.draft()}>
        <p>
          {layerName(m.layer(), c())} · {c().pending} {m.draft()!.pending.length}
        </p>
        <div class="drawing-actions">
          <button
            type="button"
            data-control-id={control('history.commit')}
            disabled={m.blocked() || !m.draft()!.pending.length}
            onClick={() => props.onCommit()}
          >
            {c().commit}
          </button>
          <button
            class="secondary"
            type="button"
            data-control-id={control('history.discard')}
            onClick={() => props.onDiscard()}
          >
            {c().discard}
          </button>
        </div>
      </Show>
      <div class="drawing-actions">
        <button
          class="secondary"
          type="button"
          data-control-id={control('history.undo')}
          disabled={!m.canStep(false)}
          aria-label={undoName(false)}
          title={undoName(false)}
          onClick={() => m.step(false)}
        >
          {c().undo}
        </button>
        <button
          class="secondary"
          type="button"
          data-control-id={control('history.redo')}
          disabled={!m.canStep(true)}
          aria-label={undoName(true)}
          title={undoName(true)}
          onClick={() => m.step(true)}
        >
          {c().redo}
        </button>
      </div>
      <p class="drawing-help" aria-live="polite">
        {c().retained} · {m.past().length + m.future().length} / {historyLimit}
        <Show when={entry()} fallback={<> · {c().historyEmpty}</>}>
          {(item) => (
            <>
              {' '}
              · {c()[item().action]}
              {item().layer && ' · ' + layerName(item().layer!, c())}
            </>
          )}
        </Show>
      </p>
      <Show
        when={
          !m.draft() &&
          [m.undoEntry(), m.redoEntry()].some(
            (item) =>
              item?.layer &&
              item.action !== 'layerChange' &&
              m.layers().some(({ id, locked }) => id === item.layer?.id && locked),
          )
        }
      >
        <p class="drawing-help">{c().historyLocked}</p>
      </Show>
    </section>
  );
}

export function ResolveDrawingDraft(props: {
  copy: DrawingCopy;
  layer: string;
  canCommit: boolean;
  onChoice: (choice: 'commit' | 'discard' | 'cancel') => void;
}) {
  let dialog!: HTMLDialogElement;
  const c = () => props.copy;
  const previous = document.activeElement;
  onMount(() => dialog.showModal());
  onCleanup(() => {
    dialog.close();
    if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
  });
  return (
    <dialog
      ref={(element) => {
        dialog = element;
      }}
      class="drawing-dialog"
      aria-labelledby="drawing-resolve-title"
      onCancel={(event) => {
        event.preventDefault();
        props.onChoice('cancel');
      }}
    >
      <h3 id="drawing-resolve-title">
        {c().resolve} · {props.layer}
      </h3>
      <p>{c().resolveHelp}</p>
      <div class="drawing-actions">
        <button
          type="button"
          data-control-id={control('resolve.commit')}
          disabled={!props.canCommit}
          onClick={() => props.onChoice('commit')}
        >
          {c().commit}
        </button>
        <button
          class="secondary"
          type="button"
          data-control-id={control('resolve.discard')}
          onClick={() => props.onChoice('discard')}
        >
          {c().discard}
        </button>
        <button
          autofocus
          class="secondary"
          type="button"
          data-control-id={control('resolve.cancel')}
          onClick={() => props.onChoice('cancel')}
        >
          {c().cancel}
        </button>
      </div>
    </dialog>
  );
}
