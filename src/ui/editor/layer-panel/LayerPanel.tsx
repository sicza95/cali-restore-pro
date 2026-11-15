import { For, Show, createEffect, createSignal, createUniqueId, on } from 'solid-js';
import { Button } from '../../controls/button/Button';
import { IconButton } from '../../controls/icon-button/IconButton';
import { moveFocus } from '../../shared/moveFocus';
import { Icon } from '../../icon/Icon';
import { Area } from '../area/Area';
import type { LayerId } from '../types';
import { LayerMeasurements } from './LayerMeasurements';
import { LayerLabel, LayerRow } from './LayerRow';
import type { LayerPanelProps } from './types';
import { coverage, findLayer, layerIds, masterLayer } from './utils';

export function LayerPanel(props: LayerPanelProps) {
  const [tab, setTab] = createSignal<'layers' | 'measurements'>('layers');
  const [collapsed, setCollapsed] = createSignal<ReadonlySet<LayerId>>(new Set());
  const id = createUniqueId();
  let body: HTMLDivElement | undefined;
  /** Keep the selected row in view inside the body only; `scrollIntoView` would scroll the page. */
  const reveal = () => {
    const row = body?.querySelector('.cr-layer-row[data-selected="true"]');
    if (!body || !row) return;
    const box = body.getBoundingClientRect();
    const item = row.getBoundingClientRect();
    if (item.top < box.top) body.scrollTop -= box.top - item.top;
    else if (item.bottom > box.bottom) body.scrollTop += item.bottom - box.bottom;
  };
  createEffect(
    on([() => props.active, () => props.size?.tall, tab], () => requestAnimationFrame(reveal)),
  );

  const isOpen = (folder: LayerId) =>
    props.onToggleExpand ? !!findLayer(props.layers, folder)?.expanded : !collapsed().has(folder);
  const toggleFolder = (folder: LayerId) => {
    if (props.onToggleExpand) return props.onToggleExpand(folder);
    const next = new Set(collapsed());
    if (!next.delete(folder)) next.add(folder);
    setCollapsed(next);
  };
  const folders = () => layerIds(props.layers, (layer) => layer.kind === 'folder');
  const share = () => (props.empty ? undefined : coverage(props.layers));
  const row = (layer: LayerId) => (
    <LayerRow
      id={layer}
      copy={props.copy}
      layers={props.layers}
      active={props.active}
      onSelect={(next) => props.onSelect(next)}
      onToggleVisible={(next) => props.onToggleVisible(next)}
      rowControlId={props.rowControlId}
    />
  );
  const node = (layer: LayerId) => (
    <Show when={folders().includes(layer)} fallback={row(layer)}>
      {group(layer)}
    </Show>
  );
  const group = (folder: LayerId) => {
    const layer = () => findLayer(props.layers, folder);
    return (
      <section class="cr-layer-group" aria-label={layer()?.name}>
        <Show
          when={props.tree}
          fallback={
            <button
              class="cr-group-header"
              type="button"
              aria-expanded={isOpen(folder)}
              aria-controls={`${id}-${folder}`}
              onClick={() => toggleFolder(folder)}
            >
              <Icon name="chevron" size={16} class={isOpen(folder) ? 'cr-chevron-open' : ''} />
              <span>
                {layer()?.name}
                <small>{props.copy.uniqueCoverage}</small>
              </span>
              <Show when={layer()?.area !== undefined}>
                <Area value={layer()?.area ?? 0} />
              </Show>
            </button>
          }
        >
          <div class="cr-layer-row cr-folder-row" data-selected={props.active === folder}>
            <button
              class="cr-folder-toggle"
              type="button"
              aria-expanded={isOpen(folder)}
              aria-controls={`${id}-${folder}`}
              aria-label={
                isOpen(folder)
                  ? props.copy.collapseFolder(layer()?.name ?? '')
                  : props.copy.expandFolder(layer()?.name ?? '')
              }
              data-control-id={props.rowControlId?.('expand')}
              onClick={() => toggleFolder(folder)}
            >
              <Icon name="chevron" size={16} class={isOpen(folder) ? 'cr-chevron-open' : ''} />
            </button>
            <button
              class="cr-layer-select"
              type="button"
              aria-pressed={props.active === folder}
              data-control-id={props.rowControlId?.('select')}
              onClick={() => props.onSelect(folder)}
            >
              <LayerLabel id={folder} layer={layer()} />
            </button>
          </div>
        </Show>
        <div id={`${id}-${folder}`} hidden={!isOpen(folder)}>
          {/* A host-owned folder drops its closed rows, so they leave the accessibility tree and the DOM. */}
          <Show when={isOpen(folder) || !props.onToggleExpand}>
            <For each={layerIds(props.layers, (item) => item.parent === folder)}>{node}</For>
          </Show>
        </div>
      </section>
    );
  };

  return (
    <aside class="cr-inspector" aria-label={props.copy.inspector}>
      <Show when={props.size}>
        {(size) => (
          <IconButton
            variant="ghost"
            icon="chevron"
            class="cr-inspector-grip"
            label={size().label}
            aria-expanded={size().tall}
            data-control-id={size().controlId}
            onClick={() => size().onTall(!size().tall)}
          />
        )}
      </Show>
      <div
        class="cr-inspector-tabs"
        role="tablist"
        aria-label={props.copy.inspectorTabs}
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
              {props.copy[name]}
            </button>
          )}
        </For>
      </div>
      <div
        id={`${id}-panel`}
        ref={(element) => (body = element)}
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
              <h2>{props.copy.emptyTitle}</h2>
              <p class="cr-note">{props.copy.emptyNote}</p>
            </div>
          }
        >
          <Show
            when={tab() === 'layers'}
            fallback={<LayerMeasurements copy={props.copy} layers={props.layers} />}
          >
            {props.lead}
            <Show
              when={props.tree}
              fallback={
                <>
                  <Show when={masterLayer(props.layers)}>
                    {(master) => (
                      <div class="cr-boundary">
                        <span>
                          <Icon name="frame" size={17} />
                          {master().name}
                        </span>
                        <Show when={master().area !== undefined}>
                          <Area value={master().area ?? 0} />
                        </Show>
                      </div>
                    )}
                  </Show>
                  <For
                    each={layerIds(
                      props.layers,
                      (layer) =>
                        !layer.parent && (layer.kind === 'folder' || layer.kind === 'damage'),
                    )}
                  >
                    {node}
                  </For>
                  <Show when={layerIds(props.layers, (layer) => layer.kind === 'phase').length > 0}>
                    <section
                      class="cr-layer-group cr-phase-group"
                      aria-label={props.copy.workPhases}
                    >
                      <h2>{props.copy.workPhases}</h2>
                      <For each={layerIds(props.layers, (layer) => layer.kind === 'phase')}>
                        {row}
                      </For>
                    </section>
                  </Show>
                </>
              }
            >
              <div class="cr-layer-tree">
                <For each={layerIds(props.layers, (layer) => !layer.parent)}>{node}</For>
              </div>
            </Show>
            {props.detail}
          </Show>
        </Show>
      </div>
      {/* Hidden when nothing in it applies: no measured areas and no calibration to open. */}
      <Show
        when={
          props.empty || props.onCalibrate || props.layers.some((layer) => layer.area !== undefined)
        }
      >
        <div class="cr-inspector-footer">
          <div class="cr-summary">
            <span>
              {folders().length === 1
                ? findLayer(props.layers, folders()[0])?.name
                : props.copy.coverage}
            </span>
            <strong>
              {share()?.toFixed(1) ?? '—'}
              <Show when={share() !== undefined}>
                <span>%</span>
              </Show>
            </strong>
          </div>
          <div class="cr-coverage-track" aria-hidden="true">
            <span style={{ width: `${Number((share() ?? 0).toFixed(1))}%` }} />
          </div>
          <Button
            variant="ghost"
            icon="measure"
            disabled={props.empty || !props.onCalibrate}
            title={props.empty ? props.copy.calibrationUnavailable : undefined}
            onClick={() => props.onCalibrate?.()}
          >
            {props.copy.calibration}
          </Button>
        </div>
      </Show>
    </aside>
  );
}
