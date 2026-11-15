import { clamp } from './geometry';
import type { Point } from './types';
import { viewTransform } from './drawing-viewport';

/** Zoom range of the drawing canvas, as a scale factor (1 is fit). */
export const minZoom = 1;
export const maxZoom = 8;
/** One step of the zoom keys and the footer buttons. */
export const zoomStep = 1.25;

export type CanvasView = { zoom: number; offset: Point };

/**
 * Zooms by `factor` around `anchor` (client coordinates) so the photo point under it stays put,
 * or follows the anchor to `to` (a pinch whose centre moves). Pinch, the wheel, the trackpad and
 * the keys all go through here.
 */
export function zoomAt(
  view: CanvasView,
  factor: number,
  anchor: Point,
  box: DOMRect,
  size: Point,
  to = anchor,
): CanvasView {
  const zoom = clamp(view.zoom * factor, minZoom, maxZoom);
  return { zoom, offset: viewTransform(view.offset, view.zoom, zoom, anchor, to, box, size) };
}

/** Moves the photo by `delta` client pixels at the current zoom. */
export function panBy(view: CanvasView, delta: Point, box: DOMRect, size: Point): Point {
  return viewTransform(view.offset, view.zoom, view.zoom, { x: 0, y: 0 }, delta, box, size);
}

/** Wheel delta in pixels, whatever unit the browser reports it in. */
export function wheelDelta(event: WheelEvent, page: number): Point {
  const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? page : 1;
  return { x: event.deltaX * unit, y: event.deltaY * unit };
}

/**
 * Zoom factor for one wheel event. Trackpad pinch arrives as many small Ctrl + wheel deltas and a
 * mouse notch as one large one, so scale exponentially and cap each event to one key step.
 */
export function wheelFactor(deltaY: number) {
  return clamp(Math.exp(-deltaY * 0.01), 1 / zoomStep, zoomStep);
}

export type WheelAction = 'zoom' | 'pan' | 'page';

/**
 * Ctrl or ⌘ plus wheel (and trackpad pinch) zooms. A plain wheel pans when zoomed in and is left
 * to the page at fit, so the surface page still scrolls past the editor.
 */
export function wheelAction(event: WheelEvent, zoom: number): WheelAction {
  if (event.ctrlKey || event.metaKey) return 'zoom';
  return zoom > minZoom ? 'pan' : 'page';
}

/** Zoom change for a key pressed on the canvas: a factor, `'fit'`, or nothing. */
export function zoomKey(event: KeyboardEvent): number | 'fit' | undefined {
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  if (event.key === '+' || event.key === '=') return zoomStep;
  if (event.key === '-' || event.key === '_') return 1 / zoomStep;
  if (event.key === '0') return 'fit';
}
