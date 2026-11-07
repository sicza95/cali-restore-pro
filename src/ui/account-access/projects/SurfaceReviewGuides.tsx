import { For, Show } from 'solid-js';
import type { SurfaceCopy } from './surface-copy';
import { lineKeys, pairKeys } from './surface-review-controls';
import type { Point, SurfaceDraft } from './surface-review-model';

export function GuideFields(props: {
  copy: SurfaceCopy;
  draft: SurfaceDraft;
  pairs?: boolean;
  change: (draft: SurfaceDraft) => void;
}) {
  const c = () => props.copy;
  return (
    <For each={props.pairs ? pairKeys : lineKeys}>
      {(key) => (
        <fieldset class="surface-guide-fields">
          <legend>{c()[key]}</legend>
          <div class="surface-fields">
            <For each={['start', 'end'] as const}>
              {(end) => (
                <For each={['x', 'y'] as const}>
                  {(axis) => (
                    <label>
                      {
                        c()[
                          props.pairs ? (end === 'start' ? 'detailPoint' : 'referencePoint') : end
                        ]
                      }{' '}
                      {c()[axis]}
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="any"
                        required
                        data-control-id={`surface.review.${key}.${end}.${axis}`}
                        value={props.draft[key][end][axis]}
                        onInput={(event) => {
                          const segment = props.draft[key];
                          props.change({
                            ...props.draft,
                            [key]: {
                              ...segment,
                              [end]: { ...segment[end], [axis]: event.currentTarget.value },
                            },
                          });
                        }}
                      />
                    </label>
                  )}
                </For>
              )}
            </For>
          </div>
        </fieldset>
      )}
    </For>
  );
}

export function SurfaceReviewGuides(props: {
  lines?: SurfaceDraft;
  pairs?: SurfaceDraft;
  reference?: boolean;
  rectification?: SurfaceDraft;
  usable?: string;
}) {
  const dot = (p: () => Point) => <circle cx={p().x} cy={p().y} r="1.6" />;
  const extent = () => Math.sqrt(Number(props.usable) * 100);
  const target = () => (props.rectification?.rectify ? props.rectification : undefined);
  return (
    <Show when={props.lines || props.pairs || target() || props.usable}>
      <svg
        class="surface-guides"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <Show when={target()}>
          {(draft) => (
            <rect
              x={Number(draft().cropX) + Number(draft().cropWidth) * 0.05}
              y={Number(draft().cropY) + Number(draft().cropHeight) * 0.05}
              width={Number(draft().cropWidth) * 0.9}
              height={Number(draft().cropHeight) * 0.9}
              stroke-dasharray="2 2"
            />
          )}
        </Show>
        <Show when={props.usable}>
          <rect
            x={(100 - extent()) / 2}
            y={(100 - extent()) / 2}
            width={extent()}
            height={extent()}
            stroke-dasharray="2 2"
          />
        </Show>
        <Show when={props.lines}>
          {(draft) => (
            <For each={lineKeys}>
              {(key) => {
                const segment = () => draft()[key];
                return (
                  <>
                    <line
                      x1={segment().start.x}
                      y1={segment().start.y}
                      x2={segment().end.x}
                      y2={segment().end.y}
                    />
                    {dot(() => segment().start)}
                    {dot(() => segment().end)}
                  </>
                );
              }}
            </For>
          )}
        </Show>
        <Show when={props.pairs}>
          {(draft) => (
            <For each={pairKeys}>
              {(key, index) => {
                const point = () => draft()[key][props.reference ? 'end' : 'start'];
                return (
                  <>
                    {dot(point)}
                    <text x={point().x} y={point().y} dx="2" dy="-2">
                      {index() + 1}
                    </text>
                  </>
                );
              }}
            </For>
          )}
        </Show>
      </svg>
    </Show>
  );
}
