# Canvas-first layout — Phase 1, step 3

15 November 2026 · Status: done, in review · Source: [quality baseline](../reviews/2026-11-14-quality-baseline.md), Phase 1 item 3 · Follows [pointer drawing first](editor-pointer-first.md)

Goal: on the surface editor, the photo gets the space and the input methods it deserves. You zoom and pan with gestures, the wheel, the trackpad or the keyboard, the photo fills the canvas, and in portrait the inspector docks below the canvas at a height that shows what you need without scrolling a small box.

## Where things stand

Steps 1 and 2 put the drawing review inside `EditorWorkspace` and made pointer drawing the main path. The tool rail already floats on the canvas's left edge, so "tool rail left" from the baseline item is met and only needs keeping. What is left, seen in the `drawing-{1194,834,390}-{closed,open}.png` screenshots from PR #15:

| Area               | Today                                                                                                                                                                                                                                                           |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Zoom and pan       | Touch pinch and two-finger pan in `DrawingCanvas.tsx` (100 to 250 %), the hand tool pans. No wheel, no trackpad pinch, no keyboard zoom. The footer has a numeric "Drawing zoom (%)" field (`view.zoom`) and "Fit reference" (`view.fit`).                      |
| Letterbox          | The photo's height is capped at `--cr-editor-height - 200px` (`workspace.css`), not fitted to the canvas box. At 834 px there is a grey band of about 100 px above the photo and the photo is narrower than the canvas.                                         |
| Portrait inspector | A fixed 286 px row at 960 px and below (`responsive.css`), 270 px at 640 px and below. The layer list, draft bar, tool settings and "Enter by number" share that box, so the layer list scrolls out of sight as soon as anything below it is used.              |
| Editor on the page | In portrait the editor starts about 470 px down the surface page, below the vault bar, breadcrumb, mode tabs, the surface and photo pickers with Previous and Next, and an explanatory notice. At 834 × 1194 the canvas is therefore below the fold on arrival. |
| 390 px             | The tool chip wraps to three rows over the photo. The footer's zoom field is clipped and "Fit reference" wraps.                                                                                                                                                 |
| Shared shell       | The portrait rules live in the shell's `responsive.css`, so they also change Storybook. `DrawingWorkspace.tsx` is at 329 lines and `DrawingCanvas.tsx` at 301 lines, so new logic goes in new files.                                                            |

## Approach

Keep the canvas math in one place and add input methods to it, then fix the space the canvas gets: fit the photo, give the portrait inspector a height you can choose, and pull the editor up the surface page. Every existing `surface.draw.*` control keeps its id; new controls get registry entries.

Rejected alternative: a third-party pan/zoom library. The canvas already has the transform (`viewTransform`) and gesture handling it needs, and `AGENTS.md` asks for no new libraries without a concrete need.

## Commits

Each commit keeps `npm run check`, `npm test` and `npm run test:files` green.

1. **`feat(editor): zoom with the wheel, trackpad and keyboard`**
   - New `canvas-zoom.ts` beside `DrawingCanvas.tsx`: one `zoomAt(point, factor)` that wraps today's pinch math (`viewTransform` plus the offset clamp), used by pinch, wheel and keys alike.
   - A non-passive `wheel` listener on the viewport: Ctrl or ⌘ plus wheel, and trackpad pinch (which browsers report as Ctrl plus wheel), zooms around the pointer. A plain wheel pans when zoomed in and is left alone at fit, so the page still scrolls past the editor.
   - With focus on the canvas: `+` and `=` zoom in, `-` zooms out, `0` fits. They go through the existing shortcut handler, after the field guard, so typing in fields is unaffected.
   - Maximum zoom 800 % (decision 1).
   - As built: the keys are handled on the canvas's own `keydown` (only when the canvas itself has focus, so fields never see them) and cancel the event, so the workspace shortcut handler skips them. The numeric `view.zoom` field's maximum is 800 % in both hosts. `tests-platform/canvas-zoom.ts` covers wheel and keys already in this commit; commit 7 adds the rest.

2. **`feat(editor): compact zoom controls in the footer`**
   - New `DrawingViewControls.tsx` (keeps `DrawingWorkspace.tsx` under 330 lines): zoom out, a readout that fits when pressed ("140 %", named "Fit · 140 %"), zoom in, and the reference-only toggle. Zoom out and in get new ids (`view.zoomOut`, `view.zoomIn`); the readout keeps `view.fit`.
   - The numeric `view.zoom` field moves into "Enter by number", next to the other exact-value fields, so the keyboard path keeps an exact zoom.
   - As built: zoom out and in step by 1.25× and keep the photo point at the middle of the canvas where it is. `DrawingCanvas` now scales the pan offset whenever zoom changes from outside (buttons or the numeric field), and leaves it alone when a gesture or key set its own offset. Zoom out is disabled at fit, zoom in at 800 %. The readout's short label is a new `fitShort` copy key ("Fit" / "Igazítás"); `fit` stays "Fit reference" for the unused `DrawingReviewAdapter`. `canvas-zoom.ts` checks the buttons, the readout name and the centre point.

3. **`fix(editor): fit the photo to the canvas`**
   - Replace the `max-height` cap with fitting the photo inside the canvas box (contain, centred), so one axis always fills the canvas. Pointer mapping already reads the photo's bounding box, so input needs no change; check the pen taps in `verifyPointerPath` still land.
   - As built: the viewport becomes a size container in the workspace, and `.drawing-photo` gets `width: min(100cqw, 100cqh * ratio)` and `aspect-ratio` from a `--drawing-ratio` variable that `DrawingCanvas` sets from the source frame. The unused `DrawingReviewAdapter` keeps its old cap. Because the photo now reaches the canvas edges, the floating tool rail covers the photo's left edge at fit; `verifyDetailDrawing` tapped at 6 % / 6 %, which now hits the Navigate button, so its corner tap moved to the top-right.

4. **`feat(editor): portrait inspector height`**
   - At 960 px and below the inspector row height comes from a state the drawing owns (decision 3: two heights). A grip button at the top of the inspector (`view.inspector`, `aria-expanded`, 44 px) switches between a short state (tabs, draft bar and the selected layer) and a tall one (about 60 % of the editor). Focus mode keeps hiding it entirely.
   - The shell takes the height as an optional prop with today's 286 px as the default, so Storybook keeps its layout unless a story opts in.
   - Selecting a layer scrolls its row into view in the inspector body.

5. **`feat(surfaces): bring the editor up in drawing mode`** (decision 4)
   - In drawing mode, the surface and photo pickers become one compact row: two selects side by side and Previous and Next as icon buttons with labels. The notice about where masks are saved moves to the editor's save state title. Photo review and checkpoint review are unchanged.
   - As built: `.surface-navigation[data-compact]` in drawing mode; Previous and Next are 44 px chevron buttons whose names come from a visually hidden span (plus `title`). The notice is the save status `title` (`saveDetail` on `EditorWorkspace`) and stays in the DOM, visually hidden, for screen readers. Surface options set `selected`, because the select's `value` alone showed the first surface after this change. Saves about 45 px at 834 px; the vault bar, back links, surface heading and mode tabs still sit above the editor.

6. **`fix(editor): phone width`**
   - At 640 px and below the tool chip docks as a bar between the canvas and the inspector instead of floating over the photo, and the footer shows only the zoom controls and the reference toggle. This keeps 390 px working without designing for it (see the open question in the handoff).
   - As built: the shell's canvas region is a two-row grid at 640 px and below; the photo, rail and labels share row 1 (explicit `1 / 1 / 2 / 2`, since abspos items treat `auto` end lines as the container edge) and the chip is an opaque bar in row 2. The footer already showed only the zoom controls and the toggle at that width.

7. **`test(editor): cover canvas-first layout`**
   - Wheel: Ctrl plus wheel zooms in and the photo point under the pointer stays within 1 px; a plain wheel at fit does not call `preventDefault` (the page scrolls); a plain wheel when zoomed pans.
   - Keys `+`, `-` and `0` on the canvas; footer zoom buttons and readout; `view.zoom` inside "Enter by number".
   - The photo fills the canvas on one axis at 1194, 834 and 390 px.
   - Portrait inspector short and tall: touch targets, the selected layer row visible, axe.
   - Screenshots and axe at 1194, 834 and 390 px. Tick Phase 1 item 3 in the quality baseline and update the handoff.
   - As built: wheel, keys and the footer buttons were already covered by `canvas-zoom.ts` from commits 1 and 2. This commit adds the photo-fit check at all three widths, `view.zoom` inside "Enter by number", and the selected layer row in view after each grip toggle. Screenshots showed that closing "Enter by number" left the inspector body scrolled past the layer list, so `LayerPanel` now also reveals the selected row when a disclosure in its body closes, and the test checks the row on arrival too.

## Risks and how the plan handles them

- **Trapping page scroll.** A wheel listener that always cancels would stop the surface page from scrolling. Commit 1 cancels only for Ctrl/⌘ plus wheel or when zoomed in, and commit 7 tests the fit case.
- **Trackpad deltas.** Pinch sends many small `deltaY` values; scale by `Math.exp(-deltaY * k)` so zoom feels the same with a mouse wheel and a trackpad, and clamp per event.
- **Desktop Safari.** It reports trackpad pinch as `gesturechange`, not Ctrl plus wheel. The iPad (the main target) uses touch pointers, which already pinch. Desktop Safari pinch is out of scope; Ctrl plus wheel and the keys still work there.
- **Storybook drift.** Commit 4 changes shell CSS. The height prop defaults to today's value, and the step 1 Storybook geometry comparison is re-run to prove nothing moved.
- **Test coordinates.** Commit 3 moves the photo inside the canvas. Tests that tap by photo percentage keep working; any that tap by viewport offset are found by `test:files` in that commit.
- **400-line limit.** New logic goes in `canvas-zoom.ts` and `DrawingViewControls.tsx`.
- **Control inventory.** `view.zoomOut`, `view.zoomIn` and `view.inspector` are added to `drawing-review/registry.ts` so `control-inventory.spec.ts` stays unique and populated.

## Out of scope for step 3

Desktop Safari trackpad pinch, rotating the photo, a minimap, retiring `DrawingReviewAdapter` (step 4), one app shell with a drawer (Phase 2 item 4), photo review's Left / Right / Up / Down buttons (photo review is not on `EditorWorkspace` yet).

## Decisions

Accepted by the owner on 15 November 2026, all as recommended.

1. **Maximum zoom.** Today 250 %. Accepted: 800 %, so fine cracks and edges can be traced on a full-resolution photo. The offset clamp scales with zoom, so nothing else changes.
2. **What a plain wheel does.** Accepted: Ctrl/⌘ plus wheel zooms; a plain wheel pans when zoomed in and scrolls the page at fit. The alternative, a plain wheel always zooming, traps page scroll on a page where the editor is one section.
3. **Portrait inspector.** Accepted: two heights (short and tall) switched by a grip button. Alternatives: one fixed taller height (about 40 % of the editor), or a draggable sheet (more code, harder to make accessible).
4. **Surface page chrome in drawing mode.** Accepted: compact it in this step (commit 5), because it decides whether the canvas is visible on arrival in portrait. Alternative: leave it for Phase 2's one app shell and drop commit 5.
5. **Where this lands.** Every commit changes a shipped screen, so accepted: all seven on one short-lived branch and one PR with screenshots, as step 2's commits 2 to 6 did.
