import { Show, createSignal } from 'solid-js';
import { IconButton } from '../ui/controls/icon-button/IconButton';
import { RangeControl } from '../ui/controls/range-control/RangeControl';
import type { Tool } from '../ui/controls/tool-rail/types';
import { CalibrationDialog } from '../ui/editor/calibration-dialog/CalibrationDialog';
import { EditorWorkspace } from '../ui/editor/editor-workspace/EditorWorkspace';
import { PhotoCanvas } from '../ui/editor/photo-canvas/PhotoCanvas';
import { PhotoStrip } from '../ui/editor/photo-strip/PhotoStrip';
import type { EditorLayer, LayerId } from '../ui/editor/types';
import {
  defaults,
  noHistory,
  reviewCopy,
  sampleLayers,
  sampleSurface,
} from './editor-review/constants';
import type { EditorReviewProps } from './editor-review/types';

// Storybook owns the synthetic editor: all state lives here, in memory, and the
// shell only renders it. Production routes render vault-backed project data.
export function EditorReviewAdapter(props: EditorReviewProps) {
  const [tool, setTool] = createSignal<Tool>(defaults.tool);
  const [layers, setLayers] = createSignal<readonly EditorLayer[]>(sampleLayers);
  const [layer, setLayer] = createSignal<LayerId>(defaults.layer);
  const [width, setWidth] = createSignal<number>(defaults.width);
  const [opacity, setOpacity] = createSignal<number>(defaults.opacity);
  const [detail, setDetail] = createSignal(false);
  const [focus, setFocus] = createSignal(props.initialFocus ?? false);
  const [calibrationOpen, setCalibrationOpen] = createSignal(false);
  const [notice, setNotice] = createSignal('');

  const toggleVisible = (id: LayerId) =>
    setLayers((previous) =>
      previous.map((item) => (item.id === id ? { ...item, visible: !item.visible } : item)),
    );
  const visible = () =>
    new Set(
      layers()
        .filter((item) => item.visible)
        .map((item) => item.id),
    );

  return (
    <EditorWorkspace
      title={sampleSurface.title}
      breadcrumb={sampleSurface.breadcrumb}
      layers={layers()}
      activeLayer={layer()}
      onSelectLayer={setLayer}
      onToggleLayer={toggleVisible}
      tool={tool()}
      onTool={setTool}
      history={noHistory}
      saveState={props.saveState ?? 'saved'}
      copy={reviewCopy}
      empty={props.initialEmpty}
      focus={focus()}
      onFocus={setFocus}
      maskOpacity={opacity()}
      onMaskOpacity={setOpacity}
      zoom={
        detail() ? { value: '2×', label: 'Detail view' } : { value: 'Fit', label: 'Full surface' }
      }
      onCalibrate={() => setCalibrationOpen(true)}
      canvas={<PhotoCanvas visible={visible()} detail={detail()} empty={props.initialEmpty} />}
      toolOptions={
        <RangeControl
          label="Width"
          min={1}
          max={60}
          value={width()}
          unit="mm"
          onChange={setWidth}
        />
      }
      footerStart={
        <Show when={!props.initialEmpty}>
          <PhotoStrip detail={detail()} onChange={setDetail} />
        </Show>
      }
    >
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
    </EditorWorkspace>
  );
}
