import { createEffect, createSignal, on, Show, untrack } from 'solid-js';
import type { JSX } from 'solid-js';
import { project } from '../../../platform/projects/planar-transform';
import type {
  Matrix,
  PlanarSurface,
  Ring,
  SourceFrame,
} from '../../../platform/projects/planar-types';
import { control, pointLimit } from './constants';
import type { DrawingReview } from './createDrawingReview';
import type { DrawingTools } from './createDrawingTools';
import { DrawingOverlay } from './DrawingOverlay';
import { asPercent } from './drawing-document';
import { drawingGestureHistory } from './drawing-gesture-history';
import { clamp } from './geometry';
import type { Point } from './types';
import { center, distance, viewTransform } from './drawing-viewport';

type Gesture =
  | { id: number; kind: 'pan'; origin: Point; offset: Point }
  | { id: number; kind: 'ink'; points: Point[]; width: number }
  | { id: number; kind: 'point'; index?: number; handle?: boolean };

export function DrawingCanvas(props: {
  model: DrawingReview;
  tools: DrawingTools;
  size?: SourceFrame;
  source?: SourceFrame;
  state?: PlanarSurface;
  toCanonical?: Matrix;
  fromCanonical?: Matrix;
  region?: Ring;
  original: boolean;
  canDraw: boolean;
  active: boolean;
  zoom: number;
  onZoom: (zoom: number) => void;
  children: JSX.Element;
}) {
  const t = untrack(() => props.tools);
  const model = untrack(() => props.model);
  const history = drawingGestureHistory(model.step);
  const [offset, setOffset] = createSignal<Point>({ x: 0, y: 0 });
  const [stroke, setStroke] = createSignal<Point[]>();
  const [cursor, setCursor] = createSignal<Point>();
  const touches = new Map<number, Point>();
  let image!: HTMLDivElement;
  let viewport!: HTMLDivElement;
  let gesture: Gesture | undefined;
  let navigating = false;
  const box = () => image.getBoundingClientRect();
  const size = () => ({ x: image.offsetWidth, y: image.offsetHeight });
  const zoom = () => props.zoom / 100;
  const raw = (event: PointerEvent): Point => ({ x: event.clientX, y: event.clientY });
  function point(event: PointerEvent) {
    const frame = props.size!;
    const bounds = box();
    const x = ((event.clientX - bounds.left) / bounds.width) * 100;
    const y = ((event.clientY - bounds.top) / bounds.height) * 100;
    if (x < 0 || x > 100 || y < 0 || y > 100) return;
    const px = [(x * frame.width) / 100, (y * frame.height) / 100] as const;
    try {
      return asPercent(props.toCanonical ? project(props.toCanonical, px) : px, props.source!);
    } catch {
      return undefined;
    }
  }
  function screen(point: Point) {
    const { width, height, left, top } = box();
    const main = props.source!;
    const view = props.size!;
    const pixel = [(point.x * main.width) / 100, (point.y * main.height) / 100] as const;
    const [x, y] = props.fromCanonical ? project(props.fromCanonical, pixel) : pixel;
    return { x: left + (x / view.width) * width, y: top + (y / view.height) * height };
  }
  function clear() {
    gesture = undefined;
    setStroke(undefined);
    setCursor(undefined);
  }
  createEffect(
    on([t.tool, () => props.model.selected(), () => props.size, () => props.active], () => {
      touches.clear();
      history.reset();
      navigating = false;
      clear();
    }),
  );
  createEffect(
    on(
      () => props.size,
      () => setOffset({ x: 0, y: 0 }),
    ),
  );
  createEffect(() => {
    const limit = (zoom() - 1) * 50;
    setOffset(({ x, y }) => ({ x: clamp(x, -limit, limit), y: clamp(y, -limit, limit) }));
  });

  createEffect(
    on(
      () => props.canDraw,
      (allowed) => {
        if (!allowed && gesture?.kind !== 'pan') clear();
      },
    ),
  );

  function capture(event: PointerEvent) {
    event.preventDefault();
    viewport.setPointerCapture(event.pointerId);
  }
  function pressure(event: PointerEvent) {
    return t.brush().pressure && event.pointerType === 'pen'
      ? 0.25 + 0.75 * clamp(event.pressure, 0, 1)
      : undefined;
  }
  function start(event: PointerEvent) {
    if (!props.size || event.button !== 0) return;
    const id = event.pointerId;
    const touch = event.pointerType === 'touch';
    if (touch) {
      if (gesture && !touches.has(gesture.id)) return;
      touches.set(id, raw(event));
      history.start(id, raw(event), touches.size, event.timeStamp);
      capture(event);
      if (touches.size > 1) {
        clear();
        navigating = true;
        return;
      }
      if (navigating) return;
    } else if (gesture || touches.size) {
      return;
    }
    if (t.tool() === 'hand' || (touch && (!t.brush().finger || !props.canDraw))) {
      gesture = { id, kind: 'pan', origin: raw(event), offset: offset() };
    } else if (props.canDraw) {
      const next = point(event);
      if (!next || !props.model.contains(next)) return;
      if (t.brushing()) {
        const points = [{ ...next, pressure: pressure(event) }];
        gesture = { id, kind: 'ink', points, width: t.brush().width };
        setStroke(points);
      } else if (t.sketching()) {
        const target = raw(event);
        const nodes = t.sketch().points;
        const handle = t.node()?.handle;
        const hitHandle = !!handle && distance(screen(handle), target) <= 22;
        let nearest = 22;
        let index = -1;
        nodes.forEach((node, i) => {
          const gap = distance(screen(node), target);
          if (gap < nearest) {
            nearest = gap;
            index = i;
          }
        });
        if (hitHandle) index = t.sketch().index;
        gesture = { id, kind: 'point', index: index < 0 ? undefined : index, handle: hitHandle };
      }
    }
    if (gesture && !touch) capture(event);
  }

  function navigate(event: PointerEvent) {
    const before = [...touches.values()].slice(0, 2);
    touches.set(event.pointerId, raw(event));
    const after = [...touches.values()].slice(0, 2);
    if (!navigating || !before.length) return false;
    const a = center(before);
    const b = center(after);
    const factor =
      before.length === 2
        ? distance(after[0]!, after[1]!) / Math.max(1, distance(before[0]!, before[1]!))
        : 1;
    const nextZoom = clamp(zoom() * factor, 1, 2.5);
    setOffset(viewTransform(offset(), zoom(), nextZoom, a, b, box(), size()));
    props.onZoom(nextZoom * 100);
    return true;
  }
  function ink(event: PointerEvent, penUp = false) {
    if (gesture?.kind !== 'ink' || !props.canDraw) return;
    const next = point(event);
    if (!next || !props.model.contains(next)) return;
    const points = gesture.points;
    const last = points.at(-1)!;
    const weight = penUp || !t.brush().stabilize ? 1 : 1 - t.brush().strength * 0.008;
    const sample = {
      x: last.x + (next.x - last.x) * weight,
      y: last.y + (next.y - last.y) * weight,
      pressure: penUp ? last.pressure : pressure(event),
    };
    const source = props.source!;
    const separation = Math.hypot(
      ((sample.x - last.x) * source.width) / 100,
      ((sample.y - last.y) * source.height) / 100,
    );
    if (separation < Math.max(0.25, (gesture.width * source.width) / 2000)) return;
    if (points.length >= pointLimit)
      points.splice(1, points.length - 1, ...points.slice(1).filter((_, i) => i % 2));
    points.push(sample);
  }
  function move(event: PointerEvent) {
    if (touches.has(event.pointerId)) {
      history.move(event.pointerId, raw(event));
      if (navigate(event)) return;
    }
    if (gesture?.id === event.pointerId && gesture.kind === 'pan') {
      setOffset(
        viewTransform(gesture.offset, zoom(), zoom(), gesture.origin, raw(event), box(), size()),
      );
      return;
    }
    if (!props.canDraw || !t.brushing()) return;
    const next = point(event);
    if (event.pointerType !== 'touch')
      setCursor(next && props.model.contains(next) ? next : undefined);
    if (gesture?.id !== event.pointerId || gesture.kind !== 'ink') return;
    const coalesced = event.getCoalescedEvents?.();
    for (const sample of coalesced?.length ? coalesced : [event]) ink(sample);
    setStroke(gesture.points.slice());
  }
  function finish(event: PointerEvent, cancelled = false) {
    if (touches.delete(event.pointerId)) {
      history.move(event.pointerId, raw(event));
      history.finish(touches.size, event.timeStamp, cancelled);
    }
    if (!touches.size) navigating = false;
    if (gesture?.id !== event.pointerId) return;
    if (!cancelled && props.canDraw && gesture.kind === 'ink') {
      ink(event, true);
      void t.stroke(gesture.points, gesture.width);
    }
    if (!cancelled && props.canDraw && gesture.kind === 'point') {
      const next = point(event);
      if (next && props.model.contains(next)) {
        if (gesture.index !== undefined) {
          t.setSketch({ ...t.sketch(), index: gesture.index });
          const node = t.node()!;
          if (distance(screen(gesture.handle ? node.handle! : node), raw(event)) > 3)
            t.updatePoint(gesture.handle ? { handle: next } : next);
        } else {
          t.place(next);
        }
      }
    }
    clear();
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
      onPointerUp={(event) => finish(event)}
      onPointerCancel={(event) => finish(event, true)}
      onLostPointerCapture={(event) => finish(event, true)}
      onPointerLeave={() => setCursor(undefined)}
      style={{ 'touch-action': props.size ? 'none' : 'auto' }}
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
        <Show when={props.size && props.source && props.region && !props.original}>
          <DrawingOverlay
            model={props.model}
            tools={t}
            view={props.size!}
            source={props.source!}
            state={props.state}
            fromCanonical={props.fromCanonical}
            region={props.region!}
            stroke={stroke()}
            cursor={cursor()}
          />
        </Show>
      </div>
    </div>
  );
}
