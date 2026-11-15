/** A client-space point. */
export type ViewPoint = { x: number; y: number };

/**
 * The photo setup view: the photo frame is translated by `x`, `y` client pixels, then scaled by
 * `zoom` percent around its centre (rotation, applied after, doesn't change these sums).
 */
export type PhotoView = { x: number; y: number; zoom: number };

export const minPhotoZoom = 50;
export const maxPhotoZoom = 250;
/** One arrow-key step, in client pixels. */
export const panStep = 24;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * Keeps the zoom in range and the photo reachable: the pan may move the photo's centre up to half
 * its scaled size (so any edge can reach the middle), and never less than 96 px.
 */
export function clampView(view: PhotoView, frame: { width: number; height: number }): PhotoView {
  const zoom = clamp(view.zoom, minPhotoZoom, maxPhotoZoom);
  const limitX = Math.max(96, (frame.width * zoom) / 200);
  const limitY = Math.max(96, (frame.height * zoom) / 200);
  return { zoom, x: clamp(view.x, -limitX, limitX), y: clamp(view.y, -limitY, limitY) };
}

/**
 * Zooms by `factor` so the photo point under `anchor` stays under it, or moves to `to` (a pinch
 * whose centre travels). `centre` is the frame's untransformed centre in client space.
 */
export function zoomPhoto(
  view: PhotoView,
  factor: number,
  anchor: ViewPoint,
  centre: ViewPoint,
  to: ViewPoint = anchor,
): PhotoView {
  const zoom = clamp(view.zoom * factor, minPhotoZoom, maxPhotoZoom);
  const applied = zoom / view.zoom;
  return {
    zoom,
    x: to.x - centre.x - applied * (anchor.x - centre.x - view.x),
    y: to.y - centre.y - applied * (anchor.y - centre.y - view.y),
  };
}

/** Moves the photo by `delta` client pixels. */
export function panPhoto(view: PhotoView, delta: ViewPoint): PhotoView {
  return { ...view, x: view.x + delta.x, y: view.y + delta.y };
}

/** Arrow keys move the photo one step in their direction. */
export const arrowPan: Record<string, ViewPoint> = {
  ArrowLeft: { x: -panStep, y: 0 },
  ArrowRight: { x: panStep, y: 0 },
  ArrowUp: { x: 0, y: -panStep },
  ArrowDown: { x: 0, y: panStep },
};
