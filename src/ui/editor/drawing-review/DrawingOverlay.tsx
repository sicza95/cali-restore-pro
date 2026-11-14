import { createMemo, createUniqueId, For, Show, untrack } from 'solid-js';
import { drawMask, markFootprint } from '../../../platform/projects/planar-drawing';
import { project } from '../../../platform/projects/planar-transform';
import type {
  Mask,
  Matrix,
  PlanarSurface,
  Ring,
  SourceFrame,
} from '../../../platform/projects/planar-types';
import type { DrawingReview } from './createDrawingReview';
import type { DrawingTools } from './createDrawingTools';
import { storedLayers, storedMark } from './drawing-document';
import { pathData } from './geometry';
import type { Layer, Point } from './types';

function MaskPaint(props: { layer: Layer; path: string; width: number }) {
  const id = createUniqueId();
  const color = () => props.layer.color;
  return (
    <g opacity={props.layer.opacity / 100}>
      <defs>
        <pattern
          id={id}
          width={props.width * 0.02}
          height={props.width * 0.02}
          patternUnits="userSpaceOnUse"
        >
          <path
            d={`M0 0L${props.width * 0.02} ${props.width * 0.02}`}
            stroke={color()}
            stroke-width={props.width * 0.005}
          />
        </pattern>
      </defs>
      <path
        d={props.path}
        fill={
          props.layer.fill === 'none'
            ? 'none'
            : props.layer.fill === 'hatch'
              ? `url(#${id})`
              : color()
        }
        stroke={props.layer.outline ? color() : 'none'}
        vector-effect="non-scaling-stroke"
      />
    </g>
  );
}

export function DrawingOverlay(props: {
  model: DrawingReview;
  tools: DrawingTools;
  view: SourceFrame;
  source: SourceFrame;
  state?: PlanarSurface;
  fromCanonical?: Matrix;
  region: Ring;
  stroke?: Point[];
  cursor?: Point;
}) {
  const m = untrack(() => props.model);
  const t = untrack(() => props.tools);
  const pending = (id: number) => m.drafts()[id]?.pending ?? [];
  const clip = createUniqueId();
  const at = (point: readonly [number, number]) =>
    props.fromCanonical ? project(props.fromCanonical, point) : point;
  const pixel = (point: Point) =>
    at([(point.x * props.source.width) / 100, (point.y * props.source.height) / 100]);
  const path = (mask?: Mask) =>
    mask?.map((ring) => 'M' + ring.map((point) => at(point).join(' ')).join('L') + 'Z').join('') ??
    '';
  const ordered = (parent = 0): Layer[] =>
    m
      .layers()
      .filter((layer) => layer.parent === parent)
      .flatMap((layer) => (layer.kind === 'folder' ? ordered(layer.id) : [layer]));
  const draw = (layer: Layer) => {
    const draft = pending(layer.id);
    const state = props.state;
    const saved = state?.drawing?.find((item) => item.id === layer.id);
    const key = saved?.key ?? layer.key ?? String(layer.id);
    const committed =
      layer.kind === 'master' ? state?.master : state?.layers.find((item) => item.id === key)?.mask;
    if (!draft.length) return committed;
    try {
      return drawMask(
        storedLayers([{ ...layer, marks: [...layer.marks, ...draft] }], props.source)[0]!,
        props.source,
      );
    } catch {
      return committed;
    }
  };
  const sketch = () => {
    const mark = t.previewMark();
    if (!mark.points.length) return '';
    // The line guide follows the editable control points. The fill uses the canonical footprint.
    const map = (point: Point) => {
      const [x, y] = pixel(point);
      return { x, y };
    };
    return pathData(
      {
        ...mark,
        points: mark.points.map((point) => ({
          ...map(point),
          handle: point.handle && map(point.handle),
        })),
      },
      1,
    );
  };
  const draftPath = (mark: Parameters<typeof storedMark>[0]) => {
    try {
      return path(markFootprint(storedMark(mark, props.source)));
    } catch {
      return '';
    }
  };
  const brushPath = (points: Point[], width: number) =>
    draftPath({
      id: 0,
      action: 'stroke',
      points,
      width,
      operation: 'add',
      closed: false,
      region: props.region,
    });
  const live = createMemo(() =>
    props.stroke?.length ? brushPath(props.stroke, t.brush().width) : '',
  );
  return (
    <svg
      class="drawing-overlay"
      viewBox={`0 0 ${props.view.width} ${props.view.height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <clipPath id={clip}>
          <path d={path([props.region])} />
        </clipPath>
      </defs>
      <g clip-path={`url(#${clip})`}>
        <For each={ordered().map(({ id }) => id)}>
          {(id) => {
            const layer = () => m.layers().find((item) => item.id === id)!;
            return (
              <Show when={layer().visible}>
                <MaskPaint layer={layer()} path={path(draw(layer()))} width={props.view.width} />
                <For each={pending(id)}>
                  {(mark) => (
                    <path
                      class="drawing-pending-mark"
                      vector-effect="non-scaling-stroke"
                      d={draftPath(mark)}
                    />
                  )}
                </For>
              </Show>
            );
          }}
        </For>
        <Show when={live()}>
          <path class="drawing-live-stroke" d={live()} />
        </Show>
      </g>
      <Show when={t.sketch().points.length && !m.blocked()}>
        <path class="drawing-pending-mark" vector-effect="non-scaling-stroke" d={sketch()} />
        <For each={t.sketch().points}>
          {(point, index) => (
            <circle
              class="drawing-point"
              classList={{ 'drawing-point-selected': t.sketch().index === index() }}
              cx={pixel(point)[0]}
              cy={pixel(point)[1]}
              r={props.view.width * 0.0085}
            />
          )}
        </For>
        <Show when={t.node()?.handle}>
          {(handle) => (
            <>
              <path
                class="drawing-pending-mark"
                vector-effect="non-scaling-stroke"
                d={`M${pixel(t.node()!).join(' ')}L${pixel(handle()).join(' ')}`}
              />
              <circle
                class="drawing-point"
                cx={pixel(handle())[0]}
                cy={pixel(handle())[1]}
                r={props.view.width * 0.0065}
              />
            </>
          )}
        </Show>
      </Show>
      <Show when={t.brush().outline && props.cursor}>
        {(cursor) => (
          <path
            class="drawing-cursor"
            vector-effect="non-scaling-stroke"
            d={brushPath([cursor()], t.brush().width)}
          />
        )}
      </Show>
    </svg>
  );
}
