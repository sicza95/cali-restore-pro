import { createUniqueId, For, Show, untrack } from 'solid-js';
import type { DrawingReview } from './createDrawingReview';
import type { DrawingTools } from './createDrawingTools';
import { pathData } from './geometry';
import type { Layer, Mark, Point } from './types';

function MaskPaint(props: { layer: Layer; marks: Mark[]; ratio: number }) {
  const id = createUniqueId();
  const paint = () => {
    const start = props.marks.reduce(
      (last, mark, index) => (mark.operation === 'replace' ? index : last),
      0,
    );
    return props.marks.slice(start);
  };
  return (
    <g opacity={props.layer.opacity / 100}>
      <defs>
        <pattern id={id + '-hatch'} width="2" height="2" patternUnits="userSpaceOnUse">
          <path d="M-1 1 1 -1M0 2 2 0M1 3 3 1" stroke={props.layer.color} stroke-width=".5" />
        </pattern>
        <mask id={id} maskUnits="userSpaceOnUse" x="0" y="0" width="100" height={100 * props.ratio}>
          <For each={paint()}>
            {(mark) => {
              const color = mark.operation === 'subtract' ? '#000' : '#fff';
              return (
                <path
                  d={pathData(mark, props.ratio)}
                  fill={mark.closed ? color : 'none'}
                  stroke={color}
                  stroke-width={mark.width}
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              );
            }}
          </For>
        </mask>
      </defs>
      <g mask={`url(#${id})`}>
        <Show when={props.layer.fill !== 'none'}>
          <rect
            width="100"
            height={100 * props.ratio}
            fill={props.layer.fill === 'hatch' ? `url(#${id}-hatch)` : props.layer.color}
          />
        </Show>
        <Show when={props.layer.outline}>
          <For each={paint().filter(({ operation }) => operation !== 'subtract')}>
            {(mark) => (
              <path
                d={pathData(mark, props.ratio)}
                stroke={props.layer.color}
                stroke-width={mark.closed ? '1.2' : Math.max(mark.width * 0.35, 0.3)}
                fill="none"
              />
            )}
          </For>
        </Show>
      </g>
    </g>
  );
}

export function DrawingOverlay(props: {
  model: DrawingReview;
  tools: DrawingTools;
  ratio: number;
  stroke?: Mark;
  cursor?: Point;
}) {
  const m = untrack(() => props.model);
  const t = untrack(() => props.tools);
  const pending = (id: number) => m.drafts()[id]?.pending ?? [];
  const ordered = (parent = 0): Layer[] =>
    m
      .layers()
      .filter((layer) => layer.parent === parent)
      .flatMap((layer) => (layer.kind === 'folder' ? ordered(layer.id) : [layer]));
  return (
    <svg class="drawing-overlay" viewBox={`0 0 100 ${100 * props.ratio}`} aria-hidden="true">
      <For each={ordered().map(({ id }) => id)}>
        {(id) => {
          const layer = () => m.layers().find((layer) => layer.id === id)!;
          return (
            <Show when={layer().visible}>
              <MaskPaint
                layer={layer()}
                marks={[...layer().marks, ...pending(id)]}
                ratio={props.ratio}
              />
              <For each={pending(id)}>
                {(mark) => <path class="drawing-pending-mark" d={pathData(mark, props.ratio)} />}
              </For>
            </Show>
          );
        }}
      </For>
      <Show when={props.stroke}>
        {(mark) => (
          <path
            class="drawing-live-stroke"
            d={pathData(mark(), props.ratio)}
            stroke-width={mark().width}
          />
        )}
      </Show>
      <Show when={t.sketch().points.length && !m.blocked()}>
        <path class="drawing-pending-mark" d={pathData(t.previewMark(), props.ratio)} />
        <For each={t.sketch().points}>
          {(point, index) => (
            <circle
              class="drawing-point"
              classList={{ 'drawing-point-selected': t.sketch().index === index() }}
              cx={point.x}
              cy={point.y * props.ratio}
              r="0.85"
            />
          )}
        </For>
        <Show when={t.node()?.handle}>
          {(handle) => (
            <>
              <line
                class="drawing-pending-mark"
                x1={t.node()!.x}
                y1={t.node()!.y * props.ratio}
                x2={handle().x}
                y2={handle().y * props.ratio}
              />
              <rect
                class="drawing-point"
                x={handle().x - 0.65}
                y={handle().y * props.ratio - 0.65}
                width="1.3"
                height="1.3"
              />
            </>
          )}
        </Show>
      </Show>
      <Show when={t.brush().outline && props.cursor}>
        {(cursor) => (
          <circle
            class="drawing-cursor"
            cx={cursor().x}
            cy={cursor().y * props.ratio}
            r={t.brush().width / 2}
          />
        )}
      </Show>
    </svg>
  );
}
