import { Show } from 'solid-js';
import { IconButton } from '../../controls/icon-button/IconButton';
import { Area } from '../area/Area';
import type { LayerLabelProps, LayerRowProps } from './types';
import { findLayer } from './utils';

/** Swatch, name and, when the layer has one, its meta line; then its area. */
export function LayerLabel(props: LayerLabelProps) {
  const name = () => (
    <span class="cr-layer-name">
      <span
        class={`cr-swatch cr-swatch--${props.id}`}
        data-fill={props.layer?.swatch.fill}
        style={{ '--cr-swatch-color': props.layer?.swatch.color }}
        aria-hidden="true"
      />
      {props.layer?.name ?? ''}
    </span>
  );
  return (
    <>
      <Show when={props.layer?.meta} fallback={name()}>
        <span class="cr-layer-label">
          {name()}
          <small class="cr-layer-meta">{props.layer?.meta}</small>
        </span>
      </Show>
      <Show when={props.layer?.area !== undefined}>
        <Area value={props.layer?.area ?? 0} />
      </Show>
    </>
  );
}

export function LayerRow(props: LayerRowProps) {
  const layer = () => findLayer(props.layers, props.id);
  const visible = () => layer()?.visible ?? false;
  const name = () => layer()?.name ?? '';

  return (
    <div class="cr-layer-row" data-selected={props.active === props.id}>
      <IconButton
        variant="ghost"
        icon={visible() ? 'eye' : 'eyeOff'}
        label={visible() ? props.copy.hideLayer(name()) : props.copy.showLayer(name())}
        aria-pressed={visible()}
        data-control-id={props.rowControlId?.('visibility')}
        onClick={() => props.onToggleVisible(props.id)}
      />
      <button
        class="cr-layer-select"
        type="button"
        aria-pressed={props.active === props.id}
        data-control-id={props.rowControlId?.('select')}
        onClick={() => props.onSelect(props.id)}
      >
        <LayerLabel id={props.id} layer={layer()} />
      </button>
    </div>
  );
}
