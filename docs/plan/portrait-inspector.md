# Portrait inspector

16 November 2026 · Status: in progress · Issue: #37 · Source: [quality baseline](../reviews/2026-11-14-quality-baseline.md#ui--5--10), row "Storybook · portrait inspector and letterbox"

Goal: in the Storybook editor composition at iPad portrait (834 × 1194), the docked inspector shows every section without scrolling, its footer no longer takes an empty right column, and the photo starts at the top of the canvas. The app's surface editor keeps its layout. iPad and desktop only ([ADR 0003](../adr/0003-ipad-and-desktop-only.md)).

## Where things stand

Measured on `main` at `11ae4a2` (`Editor/Workspace` story, 834 × 1194, dark and light alike):

| Part                 | Measurement                                                                                                                                                                                                            |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workspace rows       | canvas `minmax(0, 1fr)` = 734 px, inspector fixed at 286 px (`responsive.css`, 960 px rule)                                                                                                                            |
| Inspector body       | 232 px visible of 382 px content; it scrolls, with no cue. Cracks ends 35 px below the body's edge (row at 1086 to 1134, body ends at 1099); Work phases (1146 to 1234) and its Cleaning row are entirely out of sight |
| Right column         | the inspector footer sits in a 240 × 232 px second column; its content (coverage, track, Calibration) fills the bottom 102 px (981 to 1083), so the 114 px above it are empty; the layer list keeps 568 px             |
| Band above the photo | 97 px (canvas top 68, photo top 165), and 97 px below it                                                                                                                                                               |

The band is letterboxing, caused by the layout: the 3:2 reference photo (1536 × 1024) is drawn with `object-fit: contain` in a 810 × 734 canvas region, so it is 810 × 540 and centred. The canvas row takes everything the fixed 286 px inspector leaves, whatever the photo's shape. In landscape (1194 × 834) the inspector sits beside the canvas, the body shows all 482 px of its content, and the photo has a 46 px band above it; landscape is outside this issue and stays as it is.

The app's surface editor passes `inspectorSize`, so its rows come from the `short` and `tall` rules, not the default ones. Its inspector has no footer (no calibration, no measured areas), so the body already spans the full width: no empty right column. Its short inspector (196 px) scrolls by design and the grip opens the tall one. Its drawing canvas also letterboxes: at 834 the photo has a 121 px band above and below (`drawing-834-closed.png`, canvas top 463). That canvas is a pan and zoom stage held to at least 60 % of the first screen (#39), so the band is room to zoom into, not a fault of the docked layout; this issue leaves it alone.

## Approach

1. **The inspector takes the height its content needs.** Without `inspectorSize`, the portrait rows become `minmax(var(--cr-canvas-min, 480px), 1fr) minmax(0, auto)`: the inspector row grows to its content and the canvas gets the rest, never less than the rail and chip need. A longer layer list scrolls inside the body once the canvas reaches its minimum. The `short` and `tall` rules, which the app uses, do not change.
2. **The footer docks below the layers.** In portrait the inspector is one column; the footer becomes a full-width row under the body, with coverage and its track on the left and Calibration on the right. Fields and inspector stay opaque; tokens only.
3. **The photo meets the canvas edge.** With the inspector at its content height (about 507 px), the canvas is about 513 px tall, so the 3:2 photo fills its height: no band above, about 20 px at each side.

Phone width (640 px rules) is untouched.

## Verification

- `tests/ui.spec.ts`: at 834 × 1194, every inspector section and layer row (master boundary, Paint loss, Flaking, Lacunae, Cracks, Work phases, Cleaning) lies inside the inspector body's visible box with the body unscrolled and is not clipped by an `overflow: hidden` ancestor, and the photo's drawn top is at most 2 px below the canvas top. It must fail on `main`. Landscape checks stay.
- The app: `drawing-review.ts` and `photo-review.ts` unchanged and green; `drawing-*` screenshots compared pixel by pixel with `main`.
- `npm run check`, `test:unit`, `npm test`, `test:files`, `build-storybook`; Storybook portrait and landscape in light and dark.
