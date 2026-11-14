import { For, Show, children, createMemo } from 'solid-js';
import { Dynamic } from 'solid-js/web';
import { Button } from '../../controls/button/Button';
import { IconButton } from '../../controls/icon-button/IconButton';
import { RangeControl } from '../../controls/range-control/RangeControl';
import { SaveStatus } from '../../controls/save-status/SaveStatus';
import { ToolRail } from '../../controls/tool-rail/ToolRail';
import { Icon } from '../../icon/Icon';
import { editorCopy } from '../constants';
import { LayerPanel } from '../layer-panel/LayerPanel';
import type { EditorCopy } from '../types';
import type { EditorWorkspaceProps, ToolContextProps } from './types';

/** The floating chip that names the active tool and layer and holds the tool's options. */
function ToolContext(props: ToolContextProps) {
  const options = children(() => props.children);
  return (
    <div class="cr-tool-context cr-glass">
      <Icon name={props.tool} size={18} />
      <span>{props.layer}</span>
      <Show when={options()}>
        <span class="cr-context-divider" />
        {options()}
      </Show>
    </div>
  );
}

/** The editor layout. It is controlled: adapters own the state, the canvas and persistence. */
export function EditorWorkspace(props: EditorWorkspaceProps) {
  const copy = createMemo<EditorCopy>(() => ({ ...editorCopy, ...props.copy }));
  const activeName = () => props.layers.find((item) => item.id === props.activeLayer)?.name;

  return (
    <Dynamic
      component={props.as ?? 'main'}
      class={props.focus ? 'cr-editor cr-editor--focus' : 'cr-editor'}
      aria-label={copy().editor}
    >
      <header class="cr-editor-header">
        <div class="cr-editor-brand">
          <Icon name="brand" size={26} />
          <span>CaliRestore</span>
        </div>
        <div class="cr-editor-identity">
          <span>
            <For each={props.breadcrumb}>
              {(crumb, index) => (
                <>
                  <Show when={index() > 0}>
                    {' '}
                    <span class="cr-crumb-slash">/</span>{' '}
                  </Show>
                  {crumb}
                </>
              )}
            </For>
          </span>
          <h1>
            {props.title} <Icon name="chevron" size={13} />
          </h1>
        </div>
        <SaveStatus state={props.saveState} />
        <div class="cr-header-tools" role="group" aria-label={copy().workspaceActions}>
          <IconButton
            variant="ghost"
            icon="undo"
            label={copy().undo}
            disabled={!props.history.canUndo}
            onClick={() => props.history.onUndo()}
          />
          <IconButton
            variant="ghost"
            icon="redo"
            label={copy().redo}
            disabled={!props.history.canRedo}
            onClick={() => props.history.onRedo()}
          />
          <IconButton
            variant="ghost"
            icon="focus"
            label={props.focus ? copy().showPanels : copy().focusCanvas}
            aria-pressed={props.focus}
            onClick={() => props.onFocus(!props.focus)}
          />
          <Button
            variant="ghost"
            icon="export"
            disabled={!props.onExport}
            title={props.onExport ? undefined : copy().exportUnavailable}
            class="cr-export-button"
            onClick={() => props.onExport?.()}
          >
            {copy().export}
          </Button>
        </div>
      </header>
      <div class="cr-editor-workspace">
        <section class="cr-canvas-region" aria-label={copy().canvas}>
          <div class="cr-opacity-layer" style={{ '--cr-mask-opacity': props.maskOpacity / 100 }}>
            {props.canvas}
          </div>
          <Show when={!props.empty}>
            <ToolRail active={props.tool} onChange={(tool) => props.onTool(tool)} />
          </Show>
          <Show when={!props.empty}>
            <ToolContext tool={props.tool} layer={activeName()}>
              {props.toolOptions}
            </ToolContext>
          </Show>
        </section>
        <Show when={!props.focus}>
          <LayerPanel
            copy={copy()}
            empty={props.empty}
            layers={props.layers}
            active={props.activeLayer}
            onSelect={(layer) => props.onSelectLayer(layer)}
            onToggleVisible={(layer) => props.onToggleLayer(layer)}
            onCalibrate={props.onCalibrate && (() => props.onCalibrate?.())}
            detail={props.inspectorDetail}
          />
        </Show>
      </div>
      <Show when={!props.focus}>
        <footer class="cr-editor-footer">
          {props.footerStart}
          <div class="cr-footer-context">
            <RangeControl
              label={copy().maskOpacity}
              min={10}
              max={80}
              value={props.maskOpacity}
              unit="%"
              onChange={(opacity) => props.onMaskOpacity(opacity)}
            />
            <span class="cr-commit-label">
              <span class="cr-live-dot" />
              {copy().perStrokeSave}
            </span>
          </div>
          <Show when={props.zoom}>
            {(zoom) => (
              <span class="cr-zoom">
                {zoom().value}
                <small>{zoom().label}</small>
              </span>
            )}
          </Show>
        </footer>
      </Show>
      {props.children}
    </Dynamic>
  );
}
