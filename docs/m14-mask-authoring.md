# M-14 · Canonical mask authoring

The baseline is signed commit `a0ed706099df044e8b174c8f9bab565a712f40d4`. GnuPG and GitHub verified the signature. The [M-13 assessment evidence](m13-planar-assessment.md) defines the immutable source frame, alignment acceptance and measurement contract.

## Drawing and saving

- The drawing workspace can open the mapping original or an accepted detail. Detail coordinates map through the accepted transform into the main raster. The editable region intersects the detail crop, its accepted usable bounds and the main crop. The canvas shows the upright image for each source. Preparation remains available in Photo review, where measurements use the prepared analysis plane.
- Brush, eraser, open paths and closed shapes produce filled vector footprints. Open marks sweep a 16-sided cap along their centerline. Pen pressure changes each sample's radius, with a quarter-width minimum. The default brush width is constant and expressed as a percentage of the main raster width. Point and handle edits retain their source geometry in canonical pixels. Curves flatten with a 0.25 pixel tolerance.
- Each mark records its authoring region. Add unions coverage, subtract cuts it, and replace changes coverage within that region. An initial master eraser cuts the implicit full raster. Later crop changes clip displayed and measured coverage and preserve stored paths. Layer appearance does not enter the area kernel.
- Completed strokes save on lift in per-stroke mode. In manual mode each layer holds its own draft and Commit writes a single encrypted revision. Discard leaves the committed revision alone. Point edit prompts to resolve the selected layer's draft. Failed writes leave the previous committed rows and history in place, and pending drafts and point sketches remain available for retry.
- Undo and redo save the resulting geometry. The session retains up to 30 mark and batch actions. Committed geometry, layer metadata and editable controls reopen from the encrypted project. Older planar assessments retain their existing masks as base geometry. Their existing ring vertices lack editable mark controls.

## Interaction

- A single finger pans by default. Finger drawing is opt-in. A second finger cancels an in-progress finger mark and starts viewport navigation. Touches during a pen stroke leave the stroke in control. Pointer cancellation discards the unfinished stroke.
- Two-finger pinch zoom and pan stay in the viewport. Two- and three-finger double taps start Undo and Redo respectively. While the shared tap window is active, each subsequent eligible tap changes history once. Movement, long presses and pointer cancellation invalidate the tap sequence.
- Pencil pressure and gesture coverage use Chromium pen and touch input. Physical Apple Pencil, Safari tab and Home Screen behavior, sustained dense drawing, and responsiveness at the geometry budgets remain release checks. M-15 owns encrypted pending-draft recovery, retained history and checkpoints. M-16 owns estimates, exports and the device matrix.

## Verification

- Geometry controls compare union, holes, region-limited replace, crop reopening and pressure footprints with independent expected areas. The M-13 geometry, calibration and alignment regressions still run.
- The Chromium surface workflow checks finger opt-in, pinch cancellation of a pending stroke, variable pen pressure, pointer cancellation, rapid undo/redo taps, manual and per-stroke commits, point editing, lock and visibility, and encrypted reopen. It also exercises accepted detail input, rejection outside the usable region and reference-only gating.
- The drawing screenshots were inspected at 1194 × 834 and 834 × 1194. The browser test also checks 44 px controls, no horizontal overflow and accessibility at a 390 px phone viewport.
