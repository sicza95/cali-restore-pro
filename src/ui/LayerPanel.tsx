import { For, Show, createSignal, createUniqueId } from 'solid-js';
import { Button, IconButton, moveFocus } from './controls';
import { Icon } from './Icon';

export const sampleLayers = [
  { id: 'flaking', name: 'Flaking', area: 0.42, kind: 'damage' },
  { id: 'lacunae', name: 'Lacunae', area: 0.36, kind: 'damage' },
  { id: 'cracks', name: 'Cracks', area: 0.14, kind: 'damage' },
  { id: 'cleaning', name: 'Cleaning', area: 0.9, kind: 'phase' },
] as const;

export type LayerId = (typeof sampleLayers)[number]['id'];
export const sampleAssessment = { surface: 6, uniquePaintLoss: 0.78 } as const;

export function Area(props: { value: number }) {
  return (
    <span class="cr-number">
      {props.value.toFixed(2)} <span class="cr-unit">m²</span>
    </span>
  );
}

export function LayerPanel(props: {
  empty?: boolean;
  active: LayerId;
  onSelect: (layer: LayerId) => void;
  visible: ReadonlySet<LayerId>;
  onToggleVisible: (layer: LayerId) => void;
  onCalibrate: () => void;
}) {
  const [tab, setTab] = createSignal<'layers' | 'measurements'>('layers');
  const [expanded, setExpanded] = createSignal(true);
  const id = createUniqueId();

  const layerRow = (layer: (typeof sampleLayers)[number]) => (
    <div class="cr-layer-row" data-selected={props.active === layer.id}>
      <IconButton
        variant="ghost"
        icon={props.visible.has(layer.id) ? 'eye' : 'eyeOff'}
        label={`${props.visible.has(layer.id) ? 'Hide' : 'Show'} ${layer.name}`}
        aria-pressed={props.visible.has(layer.id)}
        onClick={() => props.onToggleVisible(layer.id)}
      />
      <button
        class="cr-layer-select"
        type="button"
        aria-pressed={props.active === layer.id}
        onClick={() => props.onSelect(layer.id)}
      >
        <span class="cr-layer-name">
          <span class={`cr-swatch cr-swatch--${layer.id}`} aria-hidden="true" />
          {layer.name}
        </span>
        <Area value={layer.area} />
      </button>
    </div>
  );

  return (
    <aside class="cr-inspector" aria-label="Surface inspector">
      <div
        class="cr-inspector-tabs"
        role="tablist"
        aria-label="Inspector"
        onKeyDown={(event) => moveFocus(event, event.currentTarget, '[role=tab]')}
      >
        <For each={['layers', 'measurements'] as const}>
          {(name) => (
            <button
              id={`${id}-${name}`}
              role="tab"
              type="button"
              aria-selected={tab() === name}
              aria-controls={`${id}-panel`}
              tabIndex={tab() === name ? 0 : -1}
              onClick={() => setTab(name)}
            >
              {name === 'layers' ? 'Layers' : 'Measurements'}
            </button>
          )}
        </For>
      </div>
      <div
        id={`${id}-panel`}
        class="cr-inspector-body"
        role="tabpanel"
        aria-labelledby={`${id}-${tab()}`}
        tabIndex={0}
      >
        <Show
          when={!props.empty}
          fallback={
            <div class="cr-inspector-empty">
              <Icon name="layers" size={24} />
              <h2>No assessment yet</h2>
              <p class="cr-note">Add an overview photo to define the surface.</p>
            </div>
          }
        >
          <Show
            when={tab() === 'layers'}
            fallback={
              <section class="cr-measurements">
                <h2>Surface quantities</h2>
                <dl class="cr-facts">
                  <div>
                    <dt>Assessed surface</dt>
                    <dd>
                      <Area value={sampleAssessment.surface} />
                    </dd>
                  </div>
                  <div>
                    <dt>Paint loss · unique</dt>
                    <dd>
                      <Area value={sampleAssessment.uniquePaintLoss} />
                    </dd>
                  </div>
                  <div>
                    <dt>Coverage</dt>
                    <dd class="cr-number">
                      {(
                        (sampleAssessment.uniquePaintLoss / sampleAssessment.surface) *
                        100
                      ).toFixed(1)}
                      %
                    </dd>
                  </div>
                </dl>
                <p class="cr-note">Unique coverage counts overlapping damage once.</p>
                <h3>Work phases</h3>
                <dl class="cr-facts">
                  <div>
                    <dt>Cleaning</dt>
                    <dd>
                      <Area value={0.9} />
                    </dd>
                  </div>
                </dl>
                <p class="cr-note">Treatment areas are measured separately.</p>
              </section>
            }
          >
            <div class="cr-boundary">
              <span>
                <Icon name="frame" size={17} />
                Master boundary
              </span>
              <Area value={sampleAssessment.surface} />
            </div>
            <section class="cr-layer-group" aria-label="Paint loss">
              <button
                class="cr-group-header"
                type="button"
                aria-expanded={expanded()}
                aria-controls={`${id}-damage`}
                onClick={() => setExpanded(!expanded())}
              >
                <Icon name="chevron" size={16} class={expanded() ? 'cr-chevron-open' : ''} />
                <span>
                  Paint loss<small>Unique coverage</small>
                </span>
                <Area value={sampleAssessment.uniquePaintLoss} />
              </button>
              <div id={`${id}-damage`} hidden={!expanded()}>
                <For
                  each={sampleLayers.filter(
                    (layer) => layer.id === 'flaking' || layer.id === 'lacunae',
                  )}
                >
                  {layerRow}
                </For>
              </div>
            </section>
            <For each={sampleLayers.filter((layer) => layer.id === 'cracks')}>{layerRow}</For>
            <section class="cr-layer-group cr-phase-group" aria-label="Work phases">
              <h2>Work phases</h2>
              <For each={sampleLayers.filter((layer) => layer.kind === 'phase')}>{layerRow}</For>
            </section>
          </Show>
        </Show>
      </div>
      <div class="cr-inspector-footer">
        <div class="cr-summary">
          <span>Paint loss</span>
          <strong>
            {props.empty ? '—' : '13.0'}
            <Show when={!props.empty}>
              <span>%</span>
            </Show>
          </strong>
        </div>
        <div class="cr-coverage-track" aria-hidden="true">
          <span style={{ width: props.empty ? '0%' : '13%' }} />
        </div>
        <Button
          variant="ghost"
          icon="measure"
          disabled={props.empty}
          title={props.empty ? 'Add a reference photo first' : undefined}
          onClick={props.onCalibrate}
        >
          Calibration & units
        </Button>
      </div>
    </aside>
  );
}
