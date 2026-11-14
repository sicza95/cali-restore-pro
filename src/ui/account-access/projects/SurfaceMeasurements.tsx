import { createEffect, createSignal, For, onCleanup, Show } from 'solid-js';
import { displayArea, resultStatus } from '../../../platform/projects/planar-measurement';
import type { PlanarResult } from '../../../platform/projects/planar-measurement';
import type { PlanarSurface } from '../../../platform/projects/planar-types';
import type { Language } from '../types';
import type { SurfaceCopy } from './surface-copy';

export function SurfaceMeasurements(props: {
  state: PlanarSurface;
  revision: number;
  imperial: boolean;
  copy: SurfaceCopy;
  language: Language;
}) {
  const [value, setValue] = createSignal<PlanarResult>();
  const [job, setJob] = createSignal<'running' | 'idle' | 'error'>('idle');
  createEffect(() => {
    const state = props.state;
    const revision = props.revision;
    setJob('running');
    let worker: Worker;
    try {
      worker = new Worker(new URL('../../../platform/projects/planar.worker.ts', import.meta.url), {
        type: 'module',
      });
    } catch {
      setJob('error');
      return;
    }
    const finish = (result: PlanarResult | null) => {
      if (result) setValue(result);
      setJob(result ? 'idle' : 'error');
      worker.terminate();
      clearTimeout(timer);
    };
    const timer = setTimeout(() => finish(null), 10_000);
    onCleanup(() => {
      clearTimeout(timer);
      worker.terminate();
    });
    worker.onerror = () => finish(null);
    worker.onmessage = (event: MessageEvent<PlanarResult | null>) => finish(event.data);
    worker.postMessage({ state, revision });
  });
  const status = () => resultStatus(value(), props.state, props.revision, job());
  const shown = () => (job() === 'idle' && status() !== 'stale' ? value() : undefined);
  const format = (value: number) =>
    new Intl.NumberFormat(props.language, { maximumSignificantDigits: 6 }).format(value);
  const area = (value: number | null | undefined) => {
    const unit = props.imperial ? 'ft' : 'm';
    return value == null ? '—' : format(displayArea(value, unit)) + ' ' + unit + '²';
  };
  return (
    <section aria-label={props.copy.measurements}>
      <h3>{props.copy.measurements}</h3>
      <p role="status">{props.copy[status()]}</p>
      <dl>
        <dt>{props.copy.assessed}</dt>
        <dd>{area(shown()?.assessed.areaM2.value)}</dd>
        <Show when={props.state.layers.some((layer) => layer.kind === 'damage')}>
          <dt>{props.copy.damage}</dt>
          <dd>{area(shown()?.damage.areaM2.value)}</dd>
          <Show when={shown()?.damage.percent.value != null}>
            <dt>{props.copy.coverage}</dt>
            <dd>{format(shown()!.damage.percent.value!)}%</dd>
          </Show>
        </Show>
        <For each={[...(shown()?.layers ?? []), ...(shown()?.categories ?? [])]}>
          {(entry) => {
            const row = () =>
              props.state.drawing?.find((layer) => (layer.key ?? String(layer.id)) === entry.id);
            return (
              <>
                <dt>{row()?.name || entry.id}</dt>
                <dd>
                  {area(entry.areaM2.value)}
                  {entry.percent.value === null ? '' : ' · ' + format(entry.percent.value) + '%'}
                </dd>
              </>
            );
          }}
        </For>
      </dl>
    </section>
  );
}
