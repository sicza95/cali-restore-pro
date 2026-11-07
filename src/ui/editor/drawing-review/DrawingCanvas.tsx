import { createEffect, createSignal, on, Show, untrack } from 'solid-js';
import type { JSX } from 'solid-js';
import { control, pointLimit } from './constants';
import type { DrawingReview } from './createDrawingReview';
import type { DrawingTools } from './createDrawingTools';
import { DrawingOverlay } from './DrawingOverlay';
import { clamp, round } from './geometry';
import type { Mark, Point } from './types';

type Gesture =
  | { id: number; tool: 'hand'; origin: Point; offset: Point }
  | { id: number; tool: 'brush'; pressures: number[] }
  | { id: number; tool: 'point' };

export function DrawingCanvas(props: {
  model: DrawingReview;
  tools: DrawingTools;
  size?: { width: number; height: number };
  original: boolean;
  canDraw: boolean;
  active: boolean;
  zoom: number;
  children: JSX.Element;
}) {
  const t = untrack(() => props.tools);
  const [offset, setOffset] = createSignal<Point>({ x: 0, y: 0 });
  const [stroke, setStroke] = createSignal<Mark>();
  const [cursor, setCursor] = createSignal<Point>();
  let image!: HTMLDivElement;
  let viewport!: HTMLDivElement;
  let gesture: Gesture | undefined;
  const ratio = () => (props.size ? props.size.height / props.size.width : 0.75);
  const zoom = () => props.zoom / 100;
  const point = (event: PointerEvent) => {
    const box = image.getBoundingClientRect();
    return {
      x: round(clamp(((event.clientX - box.left) / box.width) * 100)),
      y: round(clamp(((event.clientY - box.top) / box.height) * 100)),
    };
  };
  function cancel() {
    gesture = undefined;
    setStroke(undefined);
    setCursor(undefined);
  }
  // An in-flight pointer gesture belongs to the tool and layer where it began.
  createEffect(
    on([t.tool, () => props.model.selected(), () => props.canDraw, () => props.active], cancel),
  );
  createEffect(() => {
    const limit = (zoom() - 1) * 50;
    setOffset(({ x, y }) => ({ x: clamp(x, -limit, limit), y: clamp(y, -limit, limit) }));
  });

  function start(event: PointerEvent) {
    if (!props.size || !event.isPrimary || event.button !== 0 || gesture) return;
    if (t.tool() === 'hand' && zoom() > 1) {
      gesture = {
        id: event.pointerId,
        tool: 'hand',
        origin: { x: event.clientX, y: event.clientY },
        offset: offset(),
      };
    } else {
      if (!props.canDraw || (event.pointerType === 'touch' && !t.brush().finger)) return;
      const box = image.getBoundingClientRect();
      if (
        event.clientX < box.left ||
        event.clientX > box.right ||
        event.clientY < box.top ||
        event.clientY > box.bottom
      )
        return;
      if (t.brushing()) {
        gesture = { id: event.pointerId, tool: 'brush', pressures: [event.pressure] };
        setStroke({
          id: 0,
          action: 'stroke',
          points: [point(event)],
          closed: false,
          operation: 'add',
          width: brushWidth(event, event.pressure),
        });
      } else if (t.sketching()) {
        gesture = { id: event.pointerId, tool: 'point' };
      }
    }
    if (gesture) {
      event.preventDefault();
      viewport.setPointerCapture(event.pointerId);
    }
  }
  function move(event: PointerEvent) {
    if (gesture?.id === event.pointerId && gesture.tool === 'hand') {
      const limit = (zoom() - 1) * 50;
      setOffset({
        x: clamp(
          gesture.offset.x + ((event.clientX - gesture.origin.x) / image.offsetWidth) * 100,
          -limit,
          limit,
        ),
        y: clamp(
          gesture.offset.y + ((event.clientY - gesture.origin.y) / image.offsetHeight) * 100,
          -limit,
          limit,
        ),
      });
      return;
    }
    if (!props.canDraw || !t.brushing()) return;
    const next = point(event);
    if (event.pointerType !== 'touch') setCursor(next);
    const mark = stroke();
    if (
      gesture?.id !== event.pointerId ||
      gesture.tool !== 'brush' ||
      !mark ||
      mark.points.length >= pointLimit
    )
      return;
    const last = mark.points.at(-1)!;
    if (last.x === next.x && last.y === next.y) return;
    const weight = t.brush().stabilize ? 1 - t.brush().strength * 0.008 : 1;
    const points = [
      ...mark.points,
      {
        x: round(last.x + (next.x - last.x) * weight),
        y: round(last.y + (next.y - last.y) * weight),
      },
    ];
    if (event.pointerType === 'pen') gesture.pressures.push(event.pressure);
    const pressure =
      gesture.pressures.reduce((sum, value) => sum + value, 0) / gesture.pressures.length;
    setStroke({ ...mark, points, width: brushWidth(event, pressure) });
  }
  function brushWidth(event: PointerEvent, pressure: number) {
    return (
      t.brush().width *
      (t.brush().pressure && event.pointerType === 'pen' ? 0.25 + 0.75 * pressure : 1)
    );
  }
  function finish(event: PointerEvent) {
    if (gesture?.id !== event.pointerId) return;
    if (props.canDraw && gesture.tool === 'brush') {
      const mark = stroke();
      if (mark) t.stroke(mark.points, mark.width);
    }
    if (props.canDraw && gesture.tool === 'point') t.place(point(event));
    cancel();
  }
  return (
    <div
      ref={(element) => {
        viewport = element;
      }}
      class="drawing-viewport"
      data-control-id={control('view.canvas')}
      classList={{
        'drawing-pannable': t.tool() === 'hand' && zoom() > 1,
        'drawing-markable': props.canDraw && (t.brushing() || t.sketching()),
      }}
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={finish}
      onPointerCancel={cancel}
      onLostPointerCapture={cancel}
      onPointerLeave={() => setCursor(undefined)}
      style={{
        'touch-action':
          (t.brush().finger && props.canDraw && (t.brushing() || t.sketching())) ||
          (t.tool() === 'hand' && zoom() > 1)
            ? 'none'
            : 'auto',
      }}
    >
      <div
        ref={(element) => {
          image = element;
        }}
        class="drawing-photo"
        classList={{ 'drawing-photo-ready': !!props.size }}
        style={{ transform: `translate(${offset().x}%, ${offset().y}%) scale(${zoom()})` }}
      >
        {props.children}
        <Show when={props.size && !props.original}>
          <DrawingOverlay
            model={props.model}
            tools={t}
            ratio={ratio()}
            stroke={stroke()}
            cursor={cursor()}
          />
        </Show>
      </div>
    </div>
  );
}
