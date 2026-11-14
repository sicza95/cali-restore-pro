import { Show } from 'solid-js';
import { IconButton } from '../../controls/icon-button/IconButton';
import { Area } from '../area/Area';
import type { LayerRowProps } from './types';
import { findLayer } from './utils';

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
        onClick={() => props.onToggleVisible(props.id)}
      />
      <button
        class="cr-layer-select"
        type="button"
        aria-pressed={props.active === props.id}
        onClick={() => props.onSelect(props.id)}
      >
        <span class="cr-layer-name">
          <span
            class={`cr-swatch cr-swatch--${props.id}`}
            data-fill={layer()?.swatch.fill}
            style={{ '--cr-swatch-color': layer()?.swatch.color }}
            aria-hidden="true"
          />
          {name()}
        </span>
        <Show when={layer()?.area !== undefined}>
          <Area value={layer()?.area ?? 0} />
        </Show>
      </button>
    </div>
  );
}
