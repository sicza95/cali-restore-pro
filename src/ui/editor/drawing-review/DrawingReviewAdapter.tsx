import { createEffect, createSignal, For, on, Show } from 'solid-js';
import type { JSX } from 'solid-js';
import { moveFocus } from '../../shared/moveFocus';
import { Icon } from '../../icon/Icon';
import { control, drawingTools, masterId } from './constants';
import type { DrawingCopy } from './copy';
import { createDrawingReview } from './createDrawingReview';
import { createDrawingTools } from './createDrawingTools';
import { DrawingCanvas } from './DrawingCanvas';
import { DrawNumber, DrawToggle } from './DrawingFields';
import { DrawingHistory, ResolveDrawingDraft } from './DrawingHistory';
import { DrawingInspector } from './DrawingInspector';
import { DrawingLayers, layerName } from './DrawingLayers';
import type { Tool } from './types';
import './styles.css';

type Dimensions = { width: number; height: number };

/** Blank, in-memory review only. The caller supplies an authorized photo preview. */
export function DrawingReviewAdapter(props: {
  active: boolean;
  copy: DrawingCopy;
  photo?: (ready: (size: Dimensions) => void) => JSX.Element;
}) {
  const c = () => props.copy;
  const m = createDrawingReview();
  const [notice, setNotice] = createSignal<'changed' | 'committed' | 'discarded'>();
  const t = createDrawingTools(m, setNotice);
  const [size, setSize] = createSignal<Dimensions>();
  const [original, setOriginal] = createSignal(false);
  const [zoom, setZoom] = createSignal(100);
  createEffect(on(m.selected, () => setNotice(undefined), { defer: true }));
  const blocked = () =>
    !size() ? c().unavailable : original() ? c().showMasks : m.blocked() ? c().blocked : '';
  const toolReason = (tool: Tool) => {
    if (tool === 'select' || tool === 'hand') return size() ? '' : c().unavailable;
    if (tool === 'master') {
      const master = m.layers().find(({ id }) => id === masterId)!;
      if (size() && !original()) return master.locked || !master.visible ? c().blocked : '';
    }
    if (blocked()) return blocked();
    if (tool === 'nodes' && !m.draft() && !m.layer().marks.length) return c().noPaths;
    return '';
  };
  function select(tool: Tool) {
    if (!toolReason(tool)) {
      t.activate(tool);
      setNotice(undefined);
    }
  }
  function shortcut(event: KeyboardEvent) {
    if (
      event.defaultPrevented ||
      event.altKey ||
      t.resolve() ||
      (event.target instanceof HTMLElement &&
        event.target.closest('input, select, textarea, [contenteditable]'))
    )
      return;
    const key = event.key.toUpperCase();
    if (event.ctrlKey || event.metaKey) {
      if (key === 'Z' || key === 'Y') {
        event.preventDefault();
        m.step(key === 'Y' || event.shiftKey);
      }
      return;
    }
    const tool = drawingTools.find((item) => item.shortcut === key);
    if (tool) {
      event.preventDefault();
      select(tool.id);
    }
  }
  return (
    <div hidden={!props.active}>
      <section class="drawing-review" aria-label={c().drawingMode} onKeyDown={shortcut}>
        <p class="drawing-transient">{c().transient}</p>
        <div
          class="drawing-rail"
          role="toolbar"
          aria-label={c().rail}
          aria-orientation="vertical"
          onKeyDown={(event) => moveFocus(event, event.currentTarget, 'button')}
        >
          <For each={drawingTools}>
            {(tool) => (
              <>
                <button
                  class="secondary drawing-icon"
                  type="button"
                  data-control-id={control('tool.' + tool.id)}
                  aria-label={c()[tool.id]}
                  title={toolReason(tool.id) || `${c()[tool.id]} (${tool.shortcut})`}
                  aria-keyshortcuts={tool.shortcut}
                  aria-pressed={t.tool() === tool.id}
                  aria-disabled={!!toolReason(tool.id)}
                  aria-describedby={
                    toolReason(tool.id) ? control('tool.' + tool.id + '-reason') : undefined
                  }
                  tabIndex={t.tool() === tool.id ? 0 : -1}
                  onClick={() => select(tool.id)}
                >
                  <Icon name={tool.icon} size={21} />
                </button>
                <Show when={toolReason(tool.id)}>
                  <span class="account-visually-hidden" id={control('tool.' + tool.id + '-reason')}>
                    {toolReason(tool.id)}
                  </span>
                </Show>
              </>
            )}
          </For>
        </div>
        <section class="drawing-stage" aria-label={c().reference}>
          <DrawingCanvas
            model={m}
            tools={t}
            size={size()}
            active={props.active}
            canDraw={!blocked()}
            original={original()}
            zoom={zoom()}
          >
            {props.photo ? props.photo(setSize) : <p>{c().unavailable}</p>}
          </DrawingCanvas>
          <div class="drawing-actions drawing-view">
            <Show when={size()}>
              <DrawToggle
                name="view.original"
                label={c().original}
                checked={original()}
                onValue={setOriginal}
              />
              <DrawNumber
                name="view.zoom"
                label={c().zoom}
                min={100}
                max={250}
                value={zoom()}
                onValue={setZoom}
              />
              <button
                class="secondary"
                type="button"
                data-control-id={control('view.fit')}
                onClick={() => setZoom(100)}
              >
                {c().fit}
              </button>
            </Show>
          </div>
          <p class="drawing-help">
            {blocked() || (!m.layer().marks.length && !m.draft() ? c().noPaths : '')}
          </p>
          <p class="drawing-feedback" role="status">
            <Show when={notice()}>
              {(message) => c()[message()] + ' · ' + layerName(m.layer(), c())}
            </Show>
          </p>
        </section>
        <Show when={size()}>
          <aside class="drawing-inspector" aria-label={c().drawingMode}>
            <DrawingInspector model={m} tools={t} copy={c()} reason={toolReason(t.tool())} />
            <div class="drawing-management">
              <DrawingHistory
                model={m}
                copy={c()}
                onCommit={() => {
                  m.commitDraft();
                  setNotice('committed');
                }}
                onDiscard={() => {
                  m.discardDraft();
                  setNotice('discarded');
                }}
              />
              <DrawingLayers model={m} copy={c()} />
            </div>
          </aside>
        </Show>
        <Show when={t.resolve()}>
          <ResolveDrawingDraft
            copy={c()}
            layer={layerName(m.layer(), c())}
            canCommit={!!m.draft()?.pending.length}
            onChoice={(choice) => {
              t.resolveDraft(choice);
              if (choice !== 'cancel') setNotice(choice === 'commit' ? 'committed' : 'discarded');
            }}
          />
        </Show>
      </section>
    </div>
  );
}
