# Pointer drawing first — Phase 1, step 2

14 November 2026 · Status: done (commits 1 to 6) · Source: [quality baseline](../reviews/2026-11-14-quality-baseline.md), Phase 1 item 2 · Follows [editor convergence](editor-convergence.md)

Goal: on the surface editor, a conservator with a Pencil or a mouse draws, edits and commits masks on the photo without opening anything. The numeric point form stays as the keyboard and assistive-technology path, inside a "Details" disclosure that is closed by default.

## Where things stand

Step 1 put the drawing review inside `EditorWorkspace`. The canvas already handles pointer input: brush and eraser ink with pressure and smoothing, taps that place pen and shape points, dragging nodes and curve handles, two-finger pinch and pan, two- and three-finger tap undo and redo (`DrawingCanvas.tsx`). What keeps the form looking like the main path is where things sit in the inspector:

| Inside the "Details" disclosure today (`DrawingWorkspace.tsx:190`, `open`)                                                    | Needed by a pointer user?                                                               |
| ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Coordinate fields, "Add dot at coordinates", "Add point", point list, point x/y, handles, "Delete point" (`DrawingInspector`) | No. This is the numeric fallback.                                                       |
| Brush pressure, smoothing, strength, outline, finger drawing                                                                  | Yes. They change how the pen and finger behave.                                         |
| Path operation, "Close path", **Apply** and **Cancel** for pen, shape and node edits                                          | Yes. Without Apply, a path drawn by tapping on the canvas can never be saved.           |
| Mark picker for the node tool (`point.mark`)                                                                                  | Yes. The canvas cannot pick a mark by tapping it yet.                                   |
| `DrawingHistory`: save mode, **Commit** and **Discard** for drafts, undo and redo with descriptive names, history log         | Commit, Discard, undo and redo: yes. Save mode and the log: occasionally.               |
| `DrawingLayers`: a second layer list with mark and draft counts, add layer, layer kind, layer properties, nested folders      | Yes. The shell's `LayerPanel` above it lists the same layers without counts or actions. |

So closing the disclosure today would hide Apply, Commit, layer creation and every brush setting. Step 2 is mostly moving controls out of it, then closing it.

Other gaps from the step 1 log that this step touches: the portrait inspector is 270 px tall, so the open form scrolls in a small box; the inspector footer shows "Coverage —" and a disabled calibration button that mean nothing here; folders nested more than one level appear only in the `DrawingLayers` list.

## Approach

Split by audience. What a pointer user needs moves to the canvas chip (actions on the current sketch) or to the inspector above "Details" (tool settings, drafts, layers). What only keyboard and precision users need stays in "Details", which closes by default. Every `surface.draw.*` control id keeps its id and stays a single element; only its position changes. Duplicate controls (the second layer list, the second undo and redo pair) are removed, not hidden.

Rejected alternative: keep everything in "Details" and add a second, compact copy of Apply, Commit and layer actions outside it. Less moving today, but two controls per command breaks the unique-contract rule in `control-inventory.spec.ts` and leaves the inspector as crowded as it is.

## Commits

Each commit keeps `npm run check`, `npm test` and `npm run test:files` green. Commit 1 changes no behaviour; commits 2 to 5 change a shipped screen.

1. **`refactor(editor): split the drawing inspector into tool settings and numeric entry`**
   - `DrawingInspector.tsx` (310 lines) becomes `DrawingToolSettings` (tool heading and help, brush toggles and strength, path operation, close path, the node tool's mark picker) and `DrawingNumericEntry` (`place.x/y`, `brush.dot`, `point.add`, `point.select`, `point.x/y`, curve, handles, `point.delete`), each in its own file. `DrawingReviewAdapter` composes both, so its DOM order stays as it is.
   - `DrawingWorkspace` renders settings above "Details" and numeric entry inside it. The disclosure stays open.

2. **`feat(editor): apply and cancel sketches from the canvas`**
   - `path.apply` and `path.cancel` move into `DrawingToolOptions` (the tool chip), shown while the pen, shape or node tool has a sketch, with a live point count ("3 points"). Apply stays the one primary button in the chip.
   - The shortcut handler applies with Enter and cancels with Escape when focus is on the canvas or the rail and a sketch exists.
   - The chip wraps to a second row instead of overflowing; at 390 px it may drop the layer name first.

3. **`feat(editor): one layer list with counts and actions`**
   - `EditorLayer` gains optional `meta` (for example "3 · Mark · Pending 1") and `expanded`; `LayerPanel` takes `rowControlId(kind)` and `onToggleExpand`, renders `meta` under the name, and nests folders to any depth with the existing collapse button.
   - `DrawingWorkspace` passes `surface.draw.layer.select`, `layer.visibility` and `layer.expand` through those props, and `DrawingLayers` drops its own list. Its add row (`layer.kind`, `layer.add`) and properties disclosure move under the `LayerPanel` list, outside "Details".
   - Storybook gets no ids and no meta, so its DOM does not change.

4. **`feat(editor): drafts and history outside Details`**
   - The shell's header undo and redo take the descriptive names ("Undo · Brush stroke · Master mask") and the `history.undo` and `history.redo` ids through new `history.undoLabel`, `redoLabel` and `controlId` fields; `DrawingHistory` drops its own pair.
   - When the selected layer has pending marks, a draft bar with Commit and Discard (`history.commit`, `history.discard`) shows above the layer list. It is the inspector's only primary button while it shows.
   - Save mode (`history.mode`) and the history log stay in "Details".

5. **`feat(editor): close Details by default`**
   - Remove `open`. Rename the summary to "Enter by number" / "Megadás számokkal" and keep the open state for the session (a signal, not storage).
   - For brush, pen and shape, the tool settings show one line of help: draw on the photo, or enter points by number, where "enter points by number" is a button that opens the disclosure and moves focus to the first field. The canvas gets `aria-describedby` pointing at that help.
   - Hide the inspector footer when nothing in it applies: no layer areas and no `onCalibrate`. Storybook supplies both, so it keeps its footer.

6. **`test(editor): cover pointer-first drawing`**
   - New `openDetails(page)` helper in `tests-platform/drawing-review.ts`, opening the disclosure only when it is closed. `verifyDrawingReview`, `verifyDrawingInput` and `checkpoint-review.ts` call it before numeric fields and save mode. No selector changes otherwise.
   - New `verifyPointerPath`: with "Details" closed, tap three points with the pen, see "3 points" in the chip, press Apply and see the mark count rise; tap two points, press Escape and see the sketch gone; drag a rectangle with the shape tool and apply.
   - Assert "Details" is closed on first load, and that the touch-target check covers Apply in the chip and the header undo.
   - Screenshots and axe at 1194, 834 and 390 px with "Details" closed and open. Tick Phase 1 item 2 in the quality baseline and update the handoff.

## Risks and how the plan handles them

- **Hidden controls in tests.** Playwright will not click or select inside a closed `<details>`. Commit 6's `openDetails` covers the numeric path; everything else is moved out in commits 2 to 4 before the disclosure closes, so failures in commit 5 point at a control that was missed.
- **Chip width.** At 834 px the chip holds the tool icon, layer name, brush width or shape kind and now Apply and Cancel. Check it at 834 and 390 px in commit 2; wrapping is acceptable, clipping is not.
- **Shell props growing.** `meta`, `expanded`, `rowControlId`, `onToggleExpand` and the history labels are all optional and default to today's behaviour, and the Storybook geometry comparison from step 1 commit 2 can be re-run to prove it.
- **Two primary buttons.** Apply sits on the canvas and Commit in the inspector, and they never show at once in a single panel; this matches the baseline's "one primary per view" goal.
- **400-line limit.** `DrawingWorkspace.tsx` is at 258 lines. The help line and session state for "Details" go in a small `DrawingDetails.tsx` if it grows past 330.
- **Keyboard users.** Moving Apply into the chip changes tab order: rail → chip → inspector. That is the reading order on screen, but check it with the keyboard in both orientations.

## As built

Where the commits differ from the plan above:

- **Commit 2:** Apply and Cancel show in the chip whenever pen or shape is active (or the node tool has a mark), with Apply disabled until the sketch is valid, not only once a point exists. Enter applies from the canvas or the active tool's button only. The canvas takes focus on pointerdown so the keys reach it.
- **Commit 3:** `LayerPanel`'s grouped layout could not hold the drawing's layers (selectable master and folders, stacking order, phases inside folders), so it gained an opt-in `tree` mode. Storybook keeps the grouped layout.
- **Commit 5:** the `openDetails` test helper moved here from commit 6, because closing the disclosure would otherwise break `test:files`.
- **Commit 6:** the shape check taps two rectangle corners. The canvas places shape points by tap, and a drag places one point where it ends, so "drag a rectangle" would have needed new input handling. Also fixed: at 960 px and below, the inspector body now spans the column the hidden footer left empty.

## Out of scope for step 2

Picking a mark for the node tool by tapping its outline (it keeps its picker), gesture and wheel zoom replacing the zoom field, the cramped 390 px footer and portrait inspector height (step 3), retiring `DrawingReviewAdapter` (step 4), the repeated CaliRestore brand in the shell header (Phase 2, one app shell), layer UUIDs and raw floats in copy (Phase 2).

## Decisions

Answered by the owner on 14 November 2026, all as recommended:

1. **What stays in "Details":** the numeric form, save mode and the history log.
2. **Tap to pick a mark with the node tool:** not in this step; the picker stays visible.
3. **Where this lands:** commit 1 straight to `main`, commits 2 to 6 through one short-lived branch and PR with screenshots.
