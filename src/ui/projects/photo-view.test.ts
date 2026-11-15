import { describe, expect, it } from 'vitest';
import { clampView, panPhoto, zoomPhoto } from './photo-view';

const centre = { x: 400, y: 300 };
/** Client position of a photo point `q` (relative to the frame centre, unscaled). */
const place = (view: { x: number; y: number; zoom: number }, q: { x: number; y: number }) => ({
  x: centre.x + view.x + (view.zoom / 100) * q.x,
  y: centre.y + view.y + (view.zoom / 100) * q.y,
});

describe('photo setup view', () => {
  it('keeps the photo point under the anchor while zooming', () => {
    const view = { x: 30, y: -20, zoom: 100 };
    const q = { x: 50, y: 40 };
    const anchor = place(view, q);
    const next = zoomPhoto(view, 2, anchor, centre);
    expect(next.zoom).toBe(200);
    expect(place(next, q).x).toBeCloseTo(anchor.x);
    expect(place(next, q).y).toBeCloseTo(anchor.y);
  });

  it('moves the anchored point to where a pinch centre travels', () => {
    const view = { x: 0, y: 0, zoom: 100 };
    const q = { x: -60, y: 10 };
    const anchor = place(view, q);
    const to = { x: anchor.x + 25, y: anchor.y - 15 };
    const next = zoomPhoto(view, 1.5, anchor, centre, to);
    expect(place(next, q).x).toBeCloseTo(to.x);
    expect(place(next, q).y).toBeCloseTo(to.y);
  });

  it('clamps the zoom to 50–250 % and applies only the clamped factor', () => {
    const view = { x: 10, y: 0, zoom: 200 };
    const q = { x: 20, y: 0 };
    const anchor = place(view, q);
    const next = zoomPhoto(view, 4, anchor, centre);
    expect(next.zoom).toBe(250);
    expect(place(next, q).x).toBeCloseTo(anchor.x);
    expect(zoomPhoto(view, 0.01, anchor, centre).zoom).toBe(50);
  });

  it('pans by client pixels and keeps an edge within reach of the middle', () => {
    expect(panPhoto({ x: 1, y: 2, zoom: 100 }, { x: 24, y: -24 })).toEqual({
      x: 25,
      y: -22,
      zoom: 100,
    });
    const frame = { width: 600, height: 400 };
    expect(clampView({ x: 9999, y: -9999, zoom: 200 }, frame)).toEqual({
      x: 600,
      y: -400,
      zoom: 200,
    });
    // Small photos can still move a little.
    expect(clampView({ x: 500, y: 0, zoom: 50 }, { width: 100, height: 100 }).x).toBe(96);
  });
});
