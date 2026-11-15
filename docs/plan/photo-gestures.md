# Photo setup by gesture

15 November 2026 · Status: in progress · Issue: #34 · Source: [quality baseline re-score](../reviews/2026-11-14-quality-baseline.md#re-score-after-phases-1-to-4), UX finding 6

Goal: on the photo setup tab the photo pans and zooms the way the drawing canvas does, the Left / Right / Up / Down buttons go, and the canvas gets most of the first screen at 1194 × 834 and 834 × 1194. iPad and desktop only ([ADR 0003](../adr/0003-ipad-and-desktop-only.md)).

## Where things stand

Measured on `main` at `df37466` (`projects.browser.ts`, page scrolled to the top):

| Viewport   | Canvas top | Canvas height | Share of the first screen |
| ---------- | ---------: | ------------: | ------------------------: |
| 1194 × 834 |     440 px |        482 px |                      47 % |
| 834 × 1194 |     432 px |        657 px |                      55 % |

The view is a CSS transform on the photo frame: pan in pixels, zoom 50–250 % (a slider), rotate. Panning takes four buttons (`surface.view.pan.*`, 24 px a step). The canvas takes no pointer input on this tab.

## Approach

1. **Gestures on the canvas** (`src/ui/projects/usePhotoGestures.ts`, pure maths in `photo-view.ts` with Vitest tests):
   - one-finger, mouse or pen drag pans; two-finger pinch zooms around the fingers and follows their centre;
   - Ctrl or ⌘ + wheel (and trackpad pinch) zooms at the pointer; a plain wheel pans when zoomed past 100 % and scrolls the page otherwise;
   - the canvas is focusable: arrow keys pan 24 px, + and − zoom, 0 fits (rotation stays).
     The wheel and key rules reuse `canvas-zoom.ts` from the drawing canvas (`wheelAction`, `wheelFactor`, `wheelDelta`, `zoomKey`). The 50–250 % range and the zoom slider stay; the slider is the non-gesture zoom path.
2. **Buttons go**: `SurfacePanControls`, the `surface.view.pan.*` controls and their copy. A one-line hint under the canvas names the gestures and keys (EN and HU), and the canvas describes itself with it.
3. **More canvas on the first screen**: the picker row uses drawing mode's compact layout on this tab too, the "1 / 1 · Mapping reference" line joins it, and the canvas is sized to the rest of the screen (`100dvh` minus the chrome above it, at least 320 px). The surface header above (title, vault bar, status, object name) is #39 and stays.

## Verification

`projects.browser.ts` (via `photo-review.ts`): drag, arrow keys, Ctrl + wheel, a CDP touch pinch, + − 0, and the canvas share at both sizes (≥ 50 % at 1194, ≥ 60 % at 834). Then `npm run check`, `test:unit`, `npm test`, `test:files`, `test:sync`, `build-storybook`, and the 1194 and 834 screenshots in light and dark.
