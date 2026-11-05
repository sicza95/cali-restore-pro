import { Show, createSignal } from 'solid-js';
import { Button } from '../../controls/button/Button';
import { IconButton } from '../../controls/icon-button/IconButton';
import { RangeControl } from '../../controls/range-control/RangeControl';
import { SaveStatus } from '../../controls/save-status/SaveStatus';
import { ToolRail } from '../../controls/tool-rail/ToolRail';
import type { Tool } from '../../controls/tool-rail/types';
import { Icon } from '../../icon/Icon';
import { CalibrationDialog } from '../calibration-dialog/CalibrationDialog';
import { LayerPanel } from '../layer-panel/LayerPanel';
import { PhotoCanvas } from '../photo-canvas/PhotoCanvas';
import { PhotoStrip } from '../photo-strip/PhotoStrip';
import { defaults } from './constants';
import { sampleLayers } from '../constants';
import type { EditorWorkspaceProps } from './types';
import type { LayerId } from '../types';

/** An interactive UI composition; it deliberately has no drawing or vault implementation. */
export function EditorWorkspace(props: EditorWorkspaceProps) {
  const [tool, setTool] = createSignal<Tool>(defaults.tool);
  const [layer, setLayer] = createSignal<LayerId>(defaults.layer);
  const [visible, setVisible] = createSignal<ReadonlySet<LayerId>>(new Set(defaults.visibleLayers));
  const [width, setWidth] = createSignal<number>(defaults.width);
  const [opacity, setOpacity] = createSignal<number>(defaults.opacity);
  const [detail, setDetail] = createSignal(false);
  const [focus, setFocus] = createSignal(props.initialFocus ?? false);
  const [calibrationOpen, setCalibrationOpen] = createSignal(false);
  const [notice, setNotice] = createSignal('');

  const toggleVisible = (id: LayerId) => {
    setVisible((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <main
      class="cr-editor"
      classList={{ 'cr-editor--focus': focus() }}
      aria-label="Assessment editor"
    >
      <header class="cr-editor-header">
        <div class="cr-editor-brand">
          <Icon name="brand" size={26} />
          <span>CaliRestore</span>
        </div>
        <div class="cr-editor-identity">
          <span>
            North Chapel <span class="cr-crumb-slash">/</span> Wall painting
          </span>
          <h1>
            North wall <Icon name="chevron" size={13} />
          </h1>
        </div>
        <SaveStatus state={props.saveState ?? 'saved'} />
        <div class="cr-header-tools" role="group" aria-label="Workspace actions">
          <IconButton variant="ghost" icon="undo" label="Undo (no edits in this story)" disabled />
          <IconButton variant="ghost" icon="redo" label="Redo (no edits in this story)" disabled />
          <IconButton
            variant="ghost"
            icon="focus"
            label={focus() ? 'Show panels' : 'Focus canvas'}
            aria-pressed={focus()}
            onClick={() => setFocus(!focus())}
          />
          <Button
            variant="ghost"
            icon="export"
            disabled
            title="Output is not connected in this UI story"
            class="cr-export-button"
          >
            Export
          </Button>
        </div>
      </header>
      <div class="cr-editor-workspace">
        <section class="cr-canvas-region" aria-label="Assessment canvas">
          <div class="cr-opacity-layer" style={{ '--cr-mask-opacity': opacity() / 100 }}>
            <PhotoCanvas visible={visible()} detail={detail()} empty={props.initialEmpty} />
          </div>
          <Show when={!props.initialEmpty}>
            <ToolRail active={tool()} onChange={setTool} />
          </Show>
          <Show when={!props.initialEmpty}>
            <div class="cr-tool-context cr-glass">
              <Icon name={tool()} size={18} />
              <span>{sampleLayers.find((item) => item.id === layer())?.name}</span>
              <span class="cr-context-divider" />
              <RangeControl
                label="Width"
                min={1}
                max={60}
                value={width()}
                unit="mm"
                onChange={setWidth}
              />
            </div>
          </Show>
        </section>
        <Show when={!focus()}>
          <LayerPanel
            empty={props.initialEmpty}
            active={layer()}
            onSelect={setLayer}
            visible={visible()}
            onToggleVisible={toggleVisible}
            onCalibrate={() => setCalibrationOpen(true)}
          />
        </Show>
      </div>
      <Show when={!focus()}>
        <footer class="cr-editor-footer">
          <Show when={!props.initialEmpty}>
            <PhotoStrip detail={detail()} onChange={setDetail} />
          </Show>
          <div class="cr-footer-context">
            <RangeControl
              label="Mask opacity"
              min={10}
              max={80}
              value={opacity()}
              unit="%"
              onChange={setOpacity}
            />
            <span class="cr-commit-label">
              <span class="cr-live-dot" />
              Per-stroke save
            </span>
          </div>
          <span class="cr-zoom">
            {detail() ? '2×' : 'Fit'}
            <small>{detail() ? 'Detail view' : 'Full surface'}</small>
          </span>
        </footer>
      </Show>
      <Show when={notice()}>
        <div class="cr-inline-notice" role="status">
          {notice()}
          <IconButton
            icon="close"
            label="Dismiss calibration notice"
            variant="ghost"
            onClick={() => setNotice('')}
          />
        </div>
      </Show>
      <Show when={calibrationOpen()}>
        <CalibrationDialog
          onClose={() => setCalibrationOpen(false)}
          onApply={(dimensions) => {
            setNotice(
              `Preview dimensions: ${dimensions.widthCm} × ${dimensions.heightCm} cm. No assessment data changed.`,
            );
            setCalibrationOpen(false);
          }}
        />
      </Show>
    </main>
  );
}
