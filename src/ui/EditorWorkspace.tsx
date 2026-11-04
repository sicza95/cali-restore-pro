import { For, Show, createSignal, createUniqueId } from 'solid-js';
import { Icon } from './Icon';
import { Button, IconButton, RangeControl, SaveStatus, ToolRail } from './controls';
import type { SaveState, Tool } from './controls';
import { LayerPanel, sampleLayers } from './LayerPanel';
import type { LayerId } from './LayerPanel';
import { CalibrationDialog } from './CalibrationDialog';

export const referencePhoto = '/photos/painted-plaster.png';

export function PhotoCanvas(props: {
  visible: ReadonlySet<LayerId>;
  detail?: boolean;
  empty?: boolean;
}) {
  const hatchId = createUniqueId();
  return (
    <div class="cr-canvas" data-detail={props.detail}>
      <Show
        when={!props.empty}
        fallback={
          <div class="cr-empty">
            <Icon name="photo" size={36} />
            <h2>Add a reference photo</h2>
            <p>Start with an overview of the surface.</p>
            <Button icon="plus" disabled title="Photo import belongs to the application">
              Choose photo
            </Button>
            <small>Import is not connected in this UI story.</small>
          </div>
        }
      >
        <div class="cr-photo-space">
          <img
            src={referencePhoto}
            alt="Conservation reference of aged blue and ochre painted plaster with branching cracks and paint loss"
            draggable={false}
          />
          <svg
            viewBox="0 0 1536 1024"
            preserveAspectRatio="xMidYMid meet"
            aria-hidden="true"
            class="cr-map-overlay"
          >
            <defs>
              <pattern
                id={hatchId}
                patternUnits="userSpaceOnUse"
                width="16"
                height="16"
                patternTransform="rotate(40)"
              >
                <path d="M0 0V16" stroke="#f1cf86" stroke-width="3" />
              </pattern>
            </defs>
            <Show when={props.visible.has('flaking')}>
              <path
                class="cr-mask-fill"
                d="M1320 405l23-9 27 14 23-7-8 29-27 14-16-14-16-3Zm-84 179 34-26 29 4 18-17 18 11 4 25 36 3 9 27-23 14 10 33-24 25-32-7-13 23-33-12-10-24-36 6-15-22 14-25-8-22Z"
              />
            </Show>
            <Show when={props.visible.has('lacunae')}>
              <path
                class="cr-mask-fill"
                d="m1178 673 30-15 22 12 4 28 28 8-4 29-23 16-33-9-21-27Zm158-14 20-21 29-3 17 18 22-4 13 24-15 23-32 8-21-16-23 1Z"
              />
            </Show>
            <Show when={props.visible.has('cracks')}>
              <path
                class="cr-crack-mask"
                d="M158 0 176 33 240 79 261 115 314 142 347 188 386 228 416 251M386 228 420 207 468 164 508 136 541 87 571 64 592 0M386 228 378 271 392 308 386 350 372 388 374 438 368 486"
              />
            </Show>
            <Show when={props.visible.has('cleaning')}>
              <path
                class="cr-treatment-mask"
                fill={`url(#${hatchId})`}
                d="M1020 550h405v260h-405Z"
              />
            </Show>
          </svg>
        </div>
        <div class="cr-canvas-label cr-glass">
          <span class="cr-live-dot" />
          {props.detail ? 'Crack detail' : 'Overview'}
          <span>·</span>North wall
        </div>
        <div class="cr-scale cr-glass">
          <div>
            <span>0</span>
            <span>25</span>
            <span>50 cm</span>
          </div>
          <span class="cr-scale-line" />
        </div>
        <div class="cr-canvas-caption">Illustrative reference · shared surface masks</div>
      </Show>
    </div>
  );
}

export function PhotoStrip(props: { detail: boolean; onChange: (detail: boolean) => void }) {
  return (
    <div class="cr-photo-strip" role="group" aria-label="Photo views">
      <For
        each={[
          { name: 'Overview', detail: false },
          { name: 'Crack detail', detail: true },
        ]}
      >
        {(photo) => (
          <button
            type="button"
            class="cr-photo-thumbnail"
            data-detail={photo.detail}
            aria-pressed={props.detail === photo.detail}
            onClick={() => props.onChange(photo.detail)}
          >
            <img src={referencePhoto} alt="" />
            <span>{photo.name}</span>
          </button>
        )}
      </For>
    </div>
  );
}

export interface EditorWorkspaceProps {
  saveState?: SaveState;
  initialFocus?: boolean;
  initialEmpty?: boolean;
}

/** An interactive UI composition; it deliberately has no drawing or vault implementation. */
export function EditorWorkspace(props: EditorWorkspaceProps) {
  const [tool, setTool] = createSignal<Tool>('brush');
  const [layer, setLayer] = createSignal<LayerId>('flaking');
  const [visible, setVisible] = createSignal<ReadonlySet<LayerId>>(new Set(['flaking', 'lacunae']));
  const [width, setWidth] = createSignal(18);
  const [opacity, setOpacity] = createSignal(40);
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
