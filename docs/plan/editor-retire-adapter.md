# Retire the duplicate review components — Phase 1, step 4

15 November 2026 · Status: done, in review · Source: [quality baseline](../reviews/2026-11-14-quality-baseline.md), Phase 1 item 4 · Follows [canvas-first layout](editor-canvas-first.md)

Goal: the surface editor has one implementation. The old form-driven `DrawingReviewAdapter` and everything that exists only to serve it are gone. A parity test proves that the editor that ships still renders every drawing control the registry promises.

## Where things stand

Since [editor convergence](editor-convergence.md) commit 5, `SurfaceDrawing` renders `DrawingWorkspace` (on `EditorWorkspace`), so the route no longer uses `DrawingReviewAdapter`. Each later step kept the adapter compiling ("unchanged", "keeps its old cap", "`fit` stays for the unused adapter"). Found on `main` at `d735bc1`:

| Area                | Today                                                                                                                                                                                                                                                                                                                                                    |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dead component      | `src/ui/editor/drawing-review/DrawingReviewAdapter.tsx` (249 lines). Nothing imports it; only a doc comment in `DrawingWorkspace.tsx` names it.                                                                                                                                                                                                          |
| Adapter-only styles | In `drawing-review/styles.css` (281 lines), `.drawing-review`, `.drawing-rail`, `.drawing-stage`, `.drawing-view`, `.drawing-inspector` and `.drawing-management` are used by no other component. `.drawing-transient`, `.drawing-help`, `.drawing-feedback`, `.drawing-icon` and `.drawing-layer-controls` are shared and stay.                         |
| Two-host props      | These exist only so one component can fit both hosts. `DrawingLayers` has `list` (the workspace passes `false`). `DrawingHistory` has `controls` (the workspace passes `false`). `DrawingToolSettings` has `actions`, `toolOptions` and the `numeric` slot (the workspace passes `false` / `false` and puts numeric entry in "Enter by number" instead). |
| Copy                | Keys that only the adapter reads, such as `fit` ("Fit reference") and `drawingMode`, are still in `copy.ts` in EN and HU.                                                                                                                                                                                                                                |
| Registry            | `registry.ts` describes every `surface.draw.*` control with `composition: 'Authorized surface drawing review adapter'`.                                                                                                                                                                                                                                  |
| Parity              | `drawingControl()` in `tests-platform/drawing-review.ts` checks that an id it uses is registered. Nothing checks the reverse: that every registered id is reachable in `DrawingWorkspace`. That is the "parity test" the baseline item waits for.                                                                                                        |
| Not duplicates      | `src/stories/EditorReviewAdapter.tsx` is Storybook's in-memory host for the shell (the design target). It holds no project logic, so it stays. Photo review and checkpoint review are not on `EditorWorkspace` yet, but they are separate features, not duplicates (Phase 2).                                                                            |

## Approach

Prove parity first, then delete, then simplify. The adapter is already unrouted, so deleting it cannot change what users see. The parity test guards the simplification commit, which changes components the workspace does use. Every `surface.draw.*` id stays the same. No screen should change; the existing screenshots are the check.

Rejected alternative: keep the adapter as a "fallback" editor. It has drifted behind the workspace in three steps (zoom, fit, layer reveal), and any fallback would need the same tests. Fallback for keyboard users already lives inside the workspace ("Enter by number").

## Commits

Each commit keeps `npm run check`, `npm test` and `npm run test:files` green.

1. **`test(editor): every drawing control is reachable in the workspace`**
   - `tests-platform/drawing-review.ts` records the `surface.draw.*` ids in the DOM at the points where the existing flow already opens things: arrival, "Enter by number" open, each tool selected, a live draft, the resolve-draft dialog, the tall inspector.
   - At the end it asserts that the recorded set equals the ids in `drawingControls`, and prints the missing and the unregistered ones.
   - If ids are missing, each one is either a real gap (render it in the workspace, in this commit) or dead (remove it from the registry in commit 2, with the reason). Decision 2 covers the dead ones.

   - As built: one `MutationObserver`, installed at the start of `verifyDrawingReview`, records every `surface.draw.*` id that is rendered or renamed during the whole flow. This catches dialogs and per-tool settings without new checkpoints. It found all 67 registered ids and no unregistered ones, so there were no gaps to fix and no dead ids for commit 2. A negative run with a fake registered id failed as expected.

2. **`refactor(editor): delete DrawingReviewAdapter`**
   - Delete `DrawingReviewAdapter.tsx` and the adapter-only rules in `styles.css` (list above; confirm each with a repo-wide search before removing it).
   - `registry.ts`: change `composition` to name the workspace, and drop any ids that commit 1 found dead.
   - Update the doc comments that mention the adapter (`DrawingWorkspace.tsx`, `DrawingHistory.tsx`, `DrawingToolSettings.tsx`, `DrawingLayers.tsx`).
   - Check: `npm run check` (TypeScript and ESLint find the leftovers), `npm run build-storybook`, `test:files` parity still green.

   - As built: deleted `DrawingReviewAdapter.tsx` (249 lines) and 74 lines of `styles.css`: `.drawing-review`, `.drawing-rail`, `.drawing-stage`, `.drawing-view`, `.drawing-inspector`, `.drawing-management` and the three media queries that only placed them. `.drawing-transient` keeps its `grid-area: label` for now, because the workspace uses the class; commit 3 removes it, with the screenshot check. No registry ids were dead (commit 1), so only `composition` changed. The host-prop comments in `DrawingHistory`, `DrawingLayers` and `DrawingToolSettings` go with those props in commit 3. Screenshots against `725b90c`: five byte-identical; three differ only in run-to-run noise (see `editor-ui-verify`).

3. **`refactor(editor): one host for the drawing panels`**
   - `DrawingLayers`: remove `list` and the list branch the workspace never renders (the shell's `LayerPanel` lists layers).
   - `DrawingHistory`: remove `controls` and the draft controls it hides (`DrawingDraftBar` in the inspector lead holds them).
   - `DrawingToolSettings`: remove `actions`, `toolOptions` and the `numeric` slot. Keep only what the workspace renders; the chip keeps `DrawingToolOptions actions`.
   - `copy.ts`: delete the keys with no reader left (find them with a search after the removals), in EN and HU together.
   - Check: `test:files` screenshots `drawing-{1194,834,390}-{closed,open}.png` and `drawing-{834,390}-tall.png` look the same as at `d735bc1`. The parity test is green. Axe passes at each width.

   - As built: 197 lines removed, 21 added. `DrawingLayers` lost its list (the row memo, the `Icon` import and the `.drawing-layers` / `.drawing-layer-select` styles). `DrawingHistory` takes only `model` and `copy`. `DrawingToolSettings` always renders an `h2` and always takes `help`, so the `level` prop, `Dynamic` and the path and shape help fallback went too, along with `toolOptions`, `actions` and `numeric`. `DrawingToolOptions` lost `actions` (always on). `.drawing-transient` lost the adapter's `grid-area`. Copy: `fit`, `pathHelp`, `shapeHelp` and `collapse` had no reader left and are gone in EN and HU (`checkpointChange` and `photoChange` look unread but are history actions from `surface-journal.ts`, read through `c()[item.action]`). Screenshots against commit 2: seven pixel-identical, `drawing-834-closed` shows the same 16 antialiased pixels as before.

4. **`docs(plan): step 4 done`**
   - Tick Phase 1 item 4 in the quality baseline. Add "As built" notes here.
   - Re-rate the architecture finding "Two editor implementations" in the baseline (it should retire).
   - As built: the item is ticked in the quality baseline. Architecture weakness 3 is retired, and the architecture rating stays at 7 because the other four weaknesses still hold.

Expected size: about 250 + 100 lines removed in commit 2, and about 100 to 150 in commit 3. `DrawingWorkspace.tsx` stays at about 330 lines.

## Decisions

On 15 November 2026 the owner accepted the recommendations for decisions 1 and 2.

1. **Branch and PR, or straight to `main`?** No screen is meant to change. Accepted: still one short branch `refactor/retire-drawing-adapter` and one PR, because commit 3 touches components that ship. The PR needs no screenshots unless the before/after comparison in commit 3 finds a difference.
2. **Registry ids the workspace does not render.** Accepted: if commit 1 finds an id that only the adapter rendered and the workspace covers by other means (an old button replaced by a new control), remove it from the registry and record the replacement in the commit body. Re-add it only if the control is still needed.
3. **Open question carried from step 3:** is 390 px a supported target? It does not block this step; the step keeps today's 390 px checks.

## Out of scope

Moving photo review and checkpoint review onto `EditorWorkspace`; Storybook's `EditorReviewAdapter`; splitting `styles.css` by component; any Phase 2 copy or layout work.
