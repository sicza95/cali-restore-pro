# M-15 · Recovery, checkpoints and patterns

M-15 continues from [signed M-14](https://github.com/sicza95/cali-restore-pro/commit/649392046db7062640ddf970ed02e14fd7ac059f) and its [mask authoring evidence](m14-mask-authoring.md). GnuPG and GitHub verified the baseline.

## Drawing recovery

- Completed manual marks, pending undo/redo and commit mode are saved in an authenticated, encrypted journal scoped to the account, project, surface and mapping original. Interrupted pointer gestures remain ephemeral. Each pending mark keeps its original layer and canonical coordinates. Draft saves leave the committed project revision and measurement inputs alone.
- A committed edit and the matching history position share one strict IndexedDB transaction. Project and journal revisions use compare-and-swap, so stale tabs cannot partially publish either side. The journal binds to the committed assessment digest. A different assessment invalidates the old history and surfaces an explicit discard action for conflicting drafts.
- Committed mark, batch, layer, photo and restore actions share one timeline. The retained branch is capped at 30 actions and 384 KiB of serialized history. Drafts have a separate 256 KiB budget. An edit after Undo removes the old redo branch. Named checkpoints and committed geometry survive pruning. These are implementation budgets pending sustained device qualification.

## Assessment checkpoints

- Named checkpoints capture committed masks, canonical drawing and layer styling, preparation, calibration and detail alignments. They refer to existing originals. Originals used by checkpoints remain attached, and portable backup import remaps those references.
- Compare current and saved assessments, or two saved assessments using the same mapping original. Views support linked or independent pan and zoom, added and removed effective damage coverage, and per-layer and category changes. Physical quantities use each assessment's saved calibration. Coverage is available when a physical quantity cannot be calculated.
- Restore publishes a new current assessment revision and preserves the previous current as a named checkpoint in the same transaction. Undo and Redo can step through the restoration while its history action remains retained. Resolve pending drafts before restore.

## Patterns

- The private library saves immutable versions by name. Presets include line, dot, grid, crosshatch, square, text and a drawn vector path. Preview and layer fill use the same SVG tile component. Applying a preset embeds the chosen version in the layer, so a later library edit leaves assessments and checkpoints reproducible.
- Personal presets and the recovery journal are device-local. Project checkpoints and embedded pattern versions travel with project documents and portable backups. Hosted revision size limits still apply. Estimate-version links, published output styling, exact print scale, physical iPad/Pencil and sustained-load checks remain for M-16.

## Verification

- The Chromium surface workflow exercised layer-owned pending and undone marks after vault reopening, redo of committed geometry, checkpoint overlays, restore confirmation and restoration undo/redo. It reopened a pinned layer pattern after the personal library had two versions. It checked touch targets, horizontal overflow and axe results at tablet and phone widths. Landscape and portrait captures were inspected.
- The journal checks exercised a stale transaction, encrypted storage, lock and forget, retention pruning, redo truncation and conflicting draft preservation. Geometry and calibration reference checks still pass.
- The production-build portable backup workflow captured a calibrated checkpoint, imported it offline into a fresh vault and reopened the remapped original and its 6 m² measurement.
- The app and Storybook builds passed. All 11 Chromium Storybook tests passed against the built static files. The default Storybook dev-server run had startup and browser timeouts.
