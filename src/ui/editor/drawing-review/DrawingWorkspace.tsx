import { createEffect, createMemo, createSignal, createUniqueId, on, Show } from 'solid-js';
import type { JSX } from 'solid-js';
import { EditorWorkspace } from '../editor-workspace/EditorWorkspace';
import { control, drawingTools, masterId } from './constants';
import { maxZoom } from './canvas-zoom';
import type { DrawingCopy } from './copy';
import { createDrawingReview } from './createDrawingReview';
import { createDrawingTools } from './createDrawingTools';
import { DrawingCanvas } from './DrawingCanvas';
import { DrawNumber } from './DrawingFields';
import {
  DrawingDraftBar,
  DrawingHistory,
  historyLabel,
  ResolveDrawingDraft,
} from './DrawingHistory';
import { DrawingDetails, openDetails } from './DrawingDetails';
import { DrawingNumericEntry } from './DrawingNumericEntry';
import { sketchActive } from './DrawingSketchActions';
import { DrawingToolOptions, DrawingToolSettings, drawHelpShown } from './DrawingToolSettings';
import { DrawingViewControls } from './DrawingViewControls';
import { DrawingLayers, layerName, toggleFolder } from './DrawingLayers';
import { workspaceCopy } from './workspace-copy';
import { drawingSaveState, editorLayers, editorTools } from './workspace-props';
import { drawingFrame, drawingProjection } from '../../../platform/projects/drawing-region';
import type { PlanarSurface, SourceFrame } from '../../../platform/projects/planar-types';
import type { LocalVault } from '../../../platform/vault/vault';
import type { SurfaceJournal } from '../../../platform/projects/surface-journal';
import type { Tool } from './types';
import '../../components.css';
import './styles.css';
import './workspace.css';

/**
 * The application's drawing review, rendered through the editor shell. The model, tools,
 * canvas and every `surface.draw.*` control are the ones `DrawingReviewAdapter` uses.
 */
export function DrawingWorkspace(props: {
  active: boolean;
  vault: LocalVault;
  copy: DrawingCopy;
  language: 'en' | 'hu';
  title: string;
  breadcrumb: readonly string[];
  state?: PlanarSurface;
  source?: SourceFrame;
  referenceOnly: boolean;
  busy: boolean;
  journal?: SurfaceJournal;
  onSave: (journal: SurfaceJournal, state?: PlanarSurface) => Promise<boolean>;
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
    journal: () => props.journal,
    save: (journal, state) => props.onSave(journal, state),
    busy: () => props.busy,
  });
  const [notice, setNotice] = createSignal<'changed' | 'committed' | 'discarded'>();
  const t = createDrawingTools(m, setNotice);
  const size = () => props.source;
  const [original, setOriginal] = createSignal(false);
  const [zoom, setZoom] = createSignal(100);
  const [focus, setFocus] = createSignal(false);
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
  function toggleLayer(id: number) {
    const layer = m.layers().find((row) => row.id === id);
    if (layer && !m.busy()) void m.update(id, { visible: !layer.visible });
  }
  async function commitDraft() {
    if (await m.commitDraft()) setNotice('committed');
  }
  async function discardDraft() {
    if (await m.discardDraft()) setNotice('discarded');
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
    if (sketchKey(event)) return;
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
  /** Enter applies and Escape cancels the sketch from the canvas or the active tool's button. */
  function sketchKey(event: KeyboardEvent) {
    if (event.key !== 'Enter' && event.key !== 'Escape') return false;
    const target = event.target instanceof HTMLElement ? event.target : undefined;
    const from =
      target?.closest('.drawing-viewport') ||
      target?.closest('.cr-tool-rail [aria-pressed="true"]');
    if (!from || event.shiftKey || event.ctrlKey || event.metaKey) return false;
    if (!sketchActive(t, toolReason(t.tool()))) return false;
    if (event.key === 'Enter' ? !t.valid() : !t.sketch().points.length) return false;
    event.preventDefault();
    if (event.key === 'Enter') t.apply();
    else t.reset();
    return true;
  }
  const helpId = createUniqueId();
  let details: HTMLDetailsElement | undefined;
  const help = () => blocked() || (!m.layer().marks.length && !m.draft() ? c().noPaths : '');

  return (
    <div class="drawing-workspace" hidden={!props.active} onKeyDown={shortcut}>
      <p class="drawing-transient">{c().draftLifetime}</p>
      <EditorWorkspace<Tool>
        as="section"
        title={props.title}
        breadcrumb={props.breadcrumb}
        layers={size() && props.state ? editorLayers(m, c()) : []}
        activeLayer={String(m.selected())}
        onSelectLayer={(id) => {
          if (!m.busy()) m.select(Number(id));
        }}
        onToggleLayer={(id) => toggleLayer(Number(id))}
        layerTree
        layerControlId={(kind) => control('layer.' + kind)}
        onToggleLayerExpand={(id) => {
          if (!m.busy()) toggleFolder(m, Number(id));
        }}
        tool={t.tool()}
        onTool={select}
        tools={editorTools(c())}
        toolsLabel={c().rail}
        toolReason={toolReason}
        toolControlId={(tool) => control('tool.' + tool)}
        history={{
          // The inspector's pair sat in a fieldset disabled while saving; keep that.
          canUndo: !m.busy() && m.canStep(false),
          canRedo: !m.busy() && m.canStep(true),
          onUndo: () => void m.step(false),
          onRedo: () => void m.step(true),
          undoLabel: historyLabel(m, c(), false),
          redoLabel: historyLabel(m, c(), true),
          controlId: (action) => control('history.' + action),
        }}
        saveState={drawingSaveState(m, props.journal)}
        copy={{
          ...workspaceCopy(props.language),
          perStrokeSave: m.manual() ? c().manual : c().perStroke,
        }}
        focus={focus()}
        onFocus={setFocus}
        maskOpacity={100}
        canvas={
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
            describedBy={drawHelpShown(t, toolReason(t.tool())) ? helpId : undefined}
          >
            {props.children}
          </DrawingCanvas>
        }
        toolOptions={
          <DrawingToolOptions tools={t} copy={c()} reason={toolReason(t.tool())} actions />
        }
        inspectorLead={
          <Show when={size() && props.state}>
            <fieldset disabled={m.busy()} class="drawing-layer-controls">
              <DrawingDraftBar
                model={m}
                copy={c()}
                onCommit={commitDraft}
                onDiscard={discardDraft}
              />
            </fieldset>
          </Show>
        }
        inspectorDetail={
          <div class="drawing-workspace-detail">
            <Show when={size() && props.state}>
              <fieldset disabled={m.busy()} class="drawing-layer-controls">
                <DrawingLayers model={m} copy={c()} vault={props.vault} list={false} />
              </fieldset>
            </Show>
            <p class="drawing-help">{help()}</p>
            <Show when={size() && props.state}>
              <DrawingToolSettings
                model={m}
                tools={t}
                copy={c()}
                reason={toolReason(t.tool())}
                toolOptions={false}
                actions={false}
                level={2}
                help={{ id: helpId, onNumeric: () => details && openDetails(details) }}
              />
              <DrawingDetails
                summary={c().numericEntry}
                ref={(element) => {
                  details = element;
                }}
              >
                <DrawingNumericEntry
                  model={m}
                  tools={t}
                  copy={c()}
                  reason={toolReason(t.tool())}
                  label={c().coordinates}
                />
                <div class="drawing-fields">
                  <DrawNumber
                    name="view.zoom"
                    label={c().zoom}
                    min={100}
                    max={maxZoom * 100}
                    value={zoom()}
                    onValue={setZoom}
                  />
                </div>
                <fieldset disabled={m.busy()} class="drawing-layer-controls">
                  <DrawingHistory
                    model={m}
                    copy={c()}
                    onCommit={commitDraft}
                    onDiscard={discardDraft}
                    controls={false}
                  />
                </fieldset>
              </DrawingDetails>
            </Show>
          </div>
        }
        footerStart={
          <Show when={size()}>
            <DrawingViewControls
              copy={c()}
              zoom={zoom()}
              onZoom={setZoom}
              original={original()}
              onOriginal={setOriginal}
            />
          </Show>
        }
      >
        <p class="drawing-feedback drawing-workspace-feedback" role="status">
          <Show when={m.failed()}>{c().saveFailed}</Show>
          <Show when={!m.failed() && !m.busy() && notice()}>
            {(message) => c()[message()] + ' · ' + layerName(m.layer(), c())}
          </Show>
        </p>
        <Show when={t.resolve()}>
          <ResolveDrawingDraft
            copy={c()}
            layer={layerName(m.layer(), c())}
            canCommit={!!m.draft()?.pending.length && !m.blocked()}
            onChoice={resolveDraft}
          />
        </Show>
      </EditorWorkspace>
    </div>
  );
}
