import { onCleanup } from 'solid-js';
import {
  wheelAction,
  wheelDelta,
  wheelFactor,
  zoomKey,
} from '../editor/drawing-review/canvas-zoom';
import { arrowPan, clampView, panPhoto, zoomPhoto } from './photo-view';
import type { PhotoView, ViewPoint } from './photo-view';

type Options = {
  view: () => PhotoView;
  set: (view: PhotoView) => void;
  /** Zoom 100 % and no pan (rotation stays). */
  fit: () => void;
  enabled: () => boolean;
};

const distance = (a: ViewPoint, b: ViewPoint) => Math.hypot(a.x - b.x, a.y - b.y);
const middle = (a: ViewPoint, b: ViewPoint) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/**
 * Pan and zoom for the photo setup canvas, the way the drawing canvas works: drag pans, two
 * fingers pinch, Ctrl or ⌘ + wheel zooms at the pointer, a plain wheel pans when zoomed in and
 * scrolls the page otherwise, and on the focused canvas the arrow keys pan, + and − zoom, 0 fits.
 * Spread the result onto the canvas element.
 */
export function usePhotoGestures(options: Options) {
  let canvas: HTMLElement | undefined;
  const pointers = new Map<number, ViewPoint>();
  let start: { view: PhotoView; points: ViewPoint[]; centre: ViewPoint } | undefined;

  const frame = () => canvas?.querySelector<HTMLElement>('.surface-photo-frame') ?? undefined;
  /**
   * The frame's transform origin in client space, before any transform: the point the view's
   * scale works around. The preparation preview moves it to the top-left corner, so read the
   * computed origin rather than assuming the centre.
   */
  const frameCentre = (): ViewPoint => {
    const element = frame()!;
    const parent = (element.offsetParent as HTMLElement | null) ?? canvas!;
    const box = parent.getBoundingClientRect();
    const [ox = 0, oy = 0] = getComputedStyle(element).transformOrigin.split(' ').map(parseFloat);
    return {
      x: box.left + parent.clientLeft + element.offsetLeft + ox,
      y: box.top + parent.clientTop + element.offsetTop + oy,
    };
  };
  const canvasCentre = (): ViewPoint => {
    const box = canvas!.getBoundingClientRect();
    return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  };
  const commit = (next: PhotoView) => {
    const element = frame();
    options.set(
      element
        ? clampView(next, { width: element.offsetWidth, height: element.offsetHeight })
        : next,
    );
  };
  const zoomBy = (factor: number, anchor: ViewPoint) => {
    if (!frame()) return;
    commit(zoomPhoto(options.view(), factor, anchor, frameCentre()));
  };
  /** Each change in the set of pointers starts a new gesture from the current view. */
  const restart = () => {
    start = pointers.size
      ? { view: options.view(), points: [...pointers.values()], centre: frameCentre() }
      : undefined;
  };

  const wheel = (event: WheelEvent) => {
    if (!options.enabled() || !frame()) return;
    const action = wheelAction(event, options.view().zoom / 100);
    if (action === 'page') return;
    event.preventDefault();
    const delta = wheelDelta(event, canvas!.clientHeight);
    if (action === 'zoom') zoomBy(wheelFactor(delta.y), { x: event.clientX, y: event.clientY });
    else commit(panPhoto(options.view(), { x: -delta.x, y: -delta.y }));
  };

  return {
    ref(element: HTMLElement) {
      canvas = element;
      // Explicitly non-passive: cancelling stops page scroll and the browser's own Ctrl + wheel zoom.
      element.addEventListener('wheel', wheel, { passive: false });
      onCleanup(() => element.removeEventListener('wheel', wheel));
    },
    onPointerDown(event: PointerEvent) {
      if (!options.enabled() || !frame()) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      // Cancelling pointerdown stops text selection but also the focus change, so focus here.
      event.preventDefault();
      canvas!.focus({ preventScroll: true });
      canvas!.setPointerCapture(event.pointerId);
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      restart();
    },
    onPointerMove(event: PointerEvent) {
      if (!pointers.has(event.pointerId) || !start) return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      const now = [...pointers.values()];
      const [a, b] = start.points;
      if (a && b && now.length >= 2) {
        const factor = distance(now[0]!, now[1]!) / Math.max(1, distance(a, b));
        commit(zoomPhoto(start.view, factor, middle(a, b), start.centre, middle(now[0]!, now[1]!)));
      } else if (a) {
        commit(panPhoto(start.view, { x: now[0]!.x - a.x, y: now[0]!.y - a.y }));
      }
    },
    onPointerUp(event: PointerEvent) {
      if (!pointers.delete(event.pointerId)) return;
      restart();
    },
    onPointerCancel(event: PointerEvent) {
      if (!pointers.delete(event.pointerId)) return;
      restart();
    },
    onKeyDown(event: KeyboardEvent) {
      if (!options.enabled() || event.target !== canvas) return;
      const step = arrowPan[event.key];
      if (step && !event.altKey && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        commit(panPhoto(options.view(), step));
        return;
      }
      const zoom = zoomKey(event);
      if (zoom === undefined) return;
      event.preventDefault();
      if (zoom === 'fit') options.fit();
      else zoomBy(zoom, canvasCentre());
    },
  };
}
