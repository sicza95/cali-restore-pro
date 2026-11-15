import { formatPercent } from '../../../platform/format/number';
import { For, Show } from 'solid-js';
import { Area } from '../area/Area';
import type { LayerMeasurementsProps } from './types';
import { coverage, findLayer, layerIds, masterLayer } from './utils';

export function LayerMeasurements(props: LayerMeasurementsProps) {
  const fact = (label: (name: string) => string) => (id: string) => (
    <div>
      <dt>{label(findLayer(props.layers, id)?.name ?? '')}</dt>
      <dd>
        <Area value={findLayer(props.layers, id)?.area ?? 0} language={props.copy.language} />
      </dd>
    </div>
  );

  return (
    <section class="cr-measurements">
      <h2>{props.copy.quantities}</h2>
      <dl class="cr-facts">
        <Show when={masterLayer(props.layers)?.area} keyed>
          {(surface) => (
            <div>
              <dt>{props.copy.assessedSurface}</dt>
              <dd>
                <Area value={surface} language={props.copy.language} />
              </dd>
            </div>
          )}
        </Show>
        <For each={layerIds(props.layers, (layer) => layer.kind === 'folder')}>
          {fact((name) => props.copy.uniqueArea(name))}
        </For>
        <Show when={coverage(props.layers)} keyed>
          {(share) => (
            <div>
              <dt>{props.copy.coverage}</dt>
              <dd class="cr-number">{formatPercent(share, props.copy.language ?? 'en')}</dd>
            </div>
          )}
        </Show>
      </dl>
      <p class="cr-note">{props.copy.uniqueNote}</p>
      <h3>{props.copy.workPhases}</h3>
      <dl class="cr-facts">
        <For each={layerIds(props.layers, (layer) => layer.kind === 'phase')}>
          {fact((name) => name)}
        </For>
      </dl>
      <p class="cr-note">{props.copy.phaseNote}</p>
    </section>
  );
}
