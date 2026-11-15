import { createSignal, For, Show } from 'solid-js';
import type { CheckpointComparison } from '../../../platform/projects/checkpoint.worker';
import type { PlanarSurface } from '../../../platform/projects/planar-types';
import type { LocalVault } from '../../../platform/vault/vault';
import type { SurfaceCheckpointCopy } from './checkpoint-copy';
import type { SurfaceCopy } from './surface-copy';
import { SurfacePhoto } from './SurfacePhoto';

type View = { zoom: number; x: number; y: number };
const fit: View = { zoom: 100, x: 50, y: 50 };
type Coverage = CheckpointComparison['coverage'];
const path = (shape: Coverage | undefined) =>
  shape
    ?.flatMap((polygon) =>
      polygon.map((ring) => 'M' + ring.map((point) => point.join(' ')).join('L') + 'Z'),
    )
    .join('') ?? '';

function MapPanel(props: {
  state: PlanarSurface;
  view: View;
  label: string;
  vault: LocalVault;
  project: string;
  copy: SurfaceCopy;
  coverage?: Coverage;
  difference?: CheckpointComparison['difference'];
}) {
  const source = () => props.state.source;
  const box = () => '0 0 ' + source().width + ' ' + source().height;
  return (
    <figure class="checkpoint-figure">
      <figcaption>{props.label}</figcaption>
      <div
        class="checkpoint-image"
        style={{ 'aspect-ratio': source().width + ' / ' + source().height }}
      >
        <div
          class="checkpoint-image-plane"
          style={{
            transform: 'scale(' + props.view.zoom / 100 + ')',
            'transform-origin': props.view.x + '% ' + props.view.y + '%',
          }}
        >
          <Show when={source().id} keyed>
            {(id) => (
              <SurfacePhoto vault={props.vault} project={props.project} id={id} copy={props.copy} />
            )}
          </Show>
          <svg viewBox={box()} aria-hidden="true">
            <path class="checkpoint-mask" d={path(props.coverage)} fill-rule="evenodd" />
            <Show when={props.difference}>
              {(delta) => (
                <>
                  <path class="checkpoint-added" d={path(delta().added)} fill-rule="evenodd" />
                  <path
                    class="checkpoint-removed"
                    d={path(delta().removed)}
                    fill-rule="evenodd"
                    vector-effect="non-scaling-stroke"
                  />
                </>
              )}
            </Show>
          </svg>
        </div>
      </div>
    </figure>
  );
}

function ViewFields(props: {
  copy: SurfaceCheckpointCopy;
  view: View;
  change: (value: View) => void;
  second?: boolean;
  disabled?: boolean;
}) {
  const keys = ['zoom', 'x', 'y'] as const;
  return (
    <fieldset
      disabled={props.disabled}
      class="review-fields checkpoint-view-fields"
      aria-label={props.second ? props.copy.compare : props.copy.version}
    >
      <For each={keys}>
        {(key) => {
          const label =
            key === 'zoom' ? (props.second ? 'secondZoom' : 'zoom') : key === 'x' ? 'panX' : 'panY';
          return (
            <label>
              {props.copy[label]}
              <input
                data-control-id={
                  'checkpoint.review.' + label + (props.second && key !== 'zoom' ? '.second' : '')
                }
                type="range"
                min={key === 'zoom' ? 100 : 0}
                max={key === 'zoom' ? 200 : 100}
                value={props.view[key]}
                disabled={props.disabled || (key !== 'zoom' && props.view.zoom === 100)}
                onInput={(e) =>
                  props.change({ ...props.view, [key]: e.currentTarget.valueAsNumber })
                }
              />
            </label>
          );
        }}
      </For>
    </fieldset>
  );
}

export function CheckpointMaps(props: {
  primary: PlanarSurface;
  other?: PlanarSurface;
  label: string;
  otherLabel?: string;
  copy: SurfaceCheckpointCopy;
  photoCopy: SurfaceCopy;
  vault: LocalVault;
  project: string;
  result?: CheckpointComparison;
}) {
  const [view, setView] = createSignal(fit);
  const [otherView, setOtherView] = createSignal(fit);
  const [linked, setLinked] = createSignal(true);
  const [overlay, setOverlay] = createSignal(false);
  const c = () => props.copy;
  return (
    <>
      <div class="checkpoint-maps">
        <MapPanel
          state={props.primary}
          view={view()}
          label={props.label}
          vault={props.vault}
          project={props.project}
          copy={props.photoCopy}
          coverage={props.result?.coverage}
          difference={overlay() ? props.result?.difference : undefined}
        />
        <Show when={props.other}>
          {(other) => (
            <MapPanel
              state={other()}
              view={linked() ? view() : otherView()}
              label={props.otherLabel ?? ''}
              vault={props.vault}
              project={props.project}
              copy={props.photoCopy}
              coverage={props.result?.otherCoverage}
            />
          )}
        </Show>
      </div>
      <ViewFields copy={c()} view={view()} change={setView} />
      <Show when={props.other}>
        <div class="review-fields">
          <label class="review-check">
            <input
              data-control-id="checkpoint.review.linked"
              type="checkbox"
              checked={linked()}
              onChange={(e) => {
                setOtherView(view());
                setLinked(e.currentTarget.checked);
              }}
            />
            {c().linked}
          </label>
          <label class="review-check">
            <input
              data-control-id="checkpoint.review.overlay"
              type="checkbox"
              checked={overlay()}
              disabled={!props.result?.difference}
              onChange={(e) => setOverlay(e.currentTarget.checked)}
            />
            {c().overlay}
          </label>
        </div>
        <ViewFields
          copy={c()}
          view={linked() ? view() : otherView()}
          change={setOtherView}
          second
          disabled={linked()}
        />
        <Show when={overlay() && props.result?.difference}>
          <p class="checkpoint-legend">
            <span>{c().added}</span>
            <span>{c().removed}</span>
          </p>
        </Show>
      </Show>
    </>
  );
}
