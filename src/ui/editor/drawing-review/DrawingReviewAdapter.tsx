import { createEffect, createMemo, createSignal, For, on, Show } from 'solid-js';
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
import { drawingFrame, drawingProjection } from '../../../platform/projects/drawing-region';
import type { PlanarSurface, SourceFrame } from '../../../platform/projects/planar-types';
import type { Tool } from './types';
import './styles.css';

export function DrawingReviewAdapter(props: {
  active: boolean;
  copy: DrawingCopy;
  state?: PlanarSurface;
  source?: SourceFrame;
  referenceOnly: boolean;
  busy: boolean;
  onSave: (state: PlanarSurface) => Promise<boolean>;
  children: JSX.Element;
}) {
  const c = () => props.copy;
  const frame = createMemo(() =>
    props.state && props.source && !props.referenceOnly
      ? drawingFrame(props.state, props.source)
      : {},
  );
  const projection = createMemo(
    () => props.state && drawingProjection(frame(), props.state.source),
  );
  const region = () => (!frame().toCanonical || projection() ? frame().region : undefined);
  const m = createDrawingReview({
    state: () => props.state,
    region,
    save: (state) => props.onSave(state),
    busy: () => props.busy,
  });
  const [notice, setNotice] = createSignal<'changed' | 'committed' | 'discarded'>();
  const t = createDrawingTools(m, setNotice);
  const size = () => props.source;
  const [original, setOriginal] = createSignal(false);
  const [zoom, setZoom] = createSignal(100);
  createEffect(on(m.selected, () => setNotice(undefined), { defer: true }));
  createEffect(on(() => props.source?.id, t.reset, { defer: true }));
  const blocked = () =>
    !size() || !props.state
      ? c().unavailable
      : !region()
        ? c().alignmentRequired
        : original()
          ? c().showMasks
          : m.busy()
            ? c().saving
            : m.blocked()
              ? c().blocked
              : '';
  const toolReason = (tool: Tool) => {
    if (tool === 'select' || tool === 'hand') return size() ? '' : c().unavailable;
    if (tool === 'master') {
      const master = m.layers().find(({ id }) => id === masterId)!;
      if (region() && !original() && !m.busy())
        return master.locked || !master.visible ? c().blocked : '';
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
  async function commitDraft() {
    if (await m.commitDraft()) setNotice('committed');
  }
  async function resolveDraft(choice: 'commit' | 'discard' | 'cancel') {
    if (await t.resolveDraft(choice)) setNotice(choice === 'commit' ? 'committed' : 'discarded');
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
        <p class="drawing-transient">{c().draftLifetime}</p>
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
            source={props.state?.source}
            state={props.state}
            toCanonical={frame().toCanonical}
            fromCanonical={projection()}
            region={region()}
            active={props.active}
            canDraw={!blocked()}
            original={original()}
            zoom={zoom()}
            onZoom={setZoom}
          >
            {props.children}
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
            <Show when={m.failed()}>{c().saveFailed}</Show>
            <Show when={!m.failed() && !m.busy() && notice()}>
              {(message) => c()[message()] + ' · ' + layerName(m.layer(), c())}
            </Show>
          </p>
        </section>
        <Show when={size() && props.state}>
          <aside class="drawing-inspector" aria-label={c().drawingMode}>
            <DrawingInspector model={m} tools={t} copy={c()} reason={toolReason(t.tool())} />
            <div class="drawing-management">
              <fieldset disabled={m.busy()} class="drawing-layer-controls">
                <DrawingHistory
                  model={m}
                  copy={c()}
                  onCommit={commitDraft}
                  onDiscard={() => {
                    m.discardDraft();
                    setNotice('discarded');
                  }}
                />
                <DrawingLayers model={m} copy={c()} />
              </fieldset>
            </div>
          </aside>
        </Show>
        <Show when={t.resolve()}>
          <ResolveDrawingDraft
            copy={c()}
            layer={layerName(m.layer(), c())}
            canCommit={!!m.draft()?.pending.length && !m.blocked()}
            onChoice={resolveDraft}
          />
        </Show>
      </section>
    </div>
  );
}
