# Editor convergence — Phase 1, step 1

14 November 2026 · Status: proposed, not started · Source: [quality baseline](../reviews/2026-11-14-quality-baseline.md), Phase 1

Goal: `EditorWorkspace` becomes the surface editor that the application ships, driven by the real drawing model. Storybook keeps rendering the same component with synthetic data, so design work done there reaches users.

## Where things stand

| Piece                                                 | Today                                                                                                                                                                                                                                                                                                     |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/ui/editor/editor-workspace/EditorWorkspace.tsx`  | Presentational shell that owns its own signals. Layers come from the `sampleLayers` constant, `LayerId` is a literal union of the four sample ids, header text ("North Chapel / Wall painting / North wall") is hard-coded, strings are English only, and the root element is `<main>` sized to `100dvh`. |
| `src/ui/editor/photo-canvas/PhotoCanvas.tsx`          | Static image with four hard-coded SVG paths. No pointer handling.                                                                                                                                                                                                                                         |
| `src/ui/controls/tool-rail/ToolRail.tsx`              | Renders the fixed `tools` constant (select, brush, eraser, pen, nodes, frame, hand).                                                                                                                                                                                                                      |
| `src/ui/editor/drawing-review/`                       | The real editor logic: `createDrawingReview` (layers, drafts, journal history, commit/discard, undo/redo), `createDrawingTools`, and `DrawingCanvas` with pointer ink, point and pan gestures. Its own rail has eight tools (adds shape and master, no frame).                                            |
| `src/ui/account-access/projects/SurfaceWorkspace.tsx` | Owns the route `/projects/:project/surfaces/:surface`, the Photo / Drawing / Checkpoint mode switch, the recovery journal and saving. Drawing mode renders `SurfaceDrawing` → `DrawingReviewAdapter`.                                                                                                     |
| Tests                                                 | `tests/ui.spec.ts` drives Storybook through `.cr-*` classes and English labels. `tests-platform/drawing-review.ts` drives the app through `data-control-id="surface.draw.*"`, checked against `drawing-review/registry.ts`.                                                                               |

So the state, canvas and persistence already exist and are tested. Step 1 is a re-housing job: the shell must stop owning data, and the app must render its model through the shell.

## Approach

Make `EditorWorkspace` a controlled component with slots, move the in-memory state into the Storybook adapter, then add an application adapter that maps `DrawingReview` onto the same props. `SurfaceWorkspace` keeps route, journal and save ownership; only what drawing mode renders changes. Photo review and checkpoint review are untouched in this step.

Rejected alternative: restyling `DrawingReviewAdapter` until it looks like the Storybook editor. It is less code today, but it keeps two components to maintain and leaves Storybook showing something users never get, which is the problem this phase exists to remove.

## Commits

Each commit keeps `npm run check`, `npm test` and `npm run test:files` green.

1. **`test: stabilise Storybook cold start and narrow-shell navigation`**
   Fix the two `test:app` failures from the shell refresh and the `openStory` first-load timeout. Convergence needs a trustworthy green baseline before any refactor.

2. **`refactor(editor): make EditorWorkspace a controlled shell`**
   - New `EditorLayer` type in `src/ui/editor/types.ts`: `{ id: string; name: string; kind: 'master' | 'damage' | 'phase' | 'folder'; parent?: string; visible: boolean; locked?: boolean; area?: number; swatch: { color: string; fill: 'solid' | 'hatch' | 'none' } }`. `LayerId` becomes `string`.
   - `EditorWorkspaceProps` gains: `title`, `breadcrumb`, `layers`, `activeLayer`, `onSelectLayer`, `onToggleLayer`, `tool`, `onTool`, `history: { canUndo, canRedo, onUndo, onRedo }`, `saveState`, `copy`, and slots `canvas`, `toolOptions`, `inspectorDetail`, `footerStart`. Root element becomes configurable (`as`, default `main`) and height comes from a CSS custom property so the shell can sit inside the account layout.
   - `LayerPanel` and the tool-context chip read from props instead of `sampleLayers` / `sampleAssessment`.
   - `src/stories/EditorReviewAdapter.tsx` takes over the signals that `EditorWorkspace` holds today and passes `PhotoCanvas` into the `canvas` slot. Stories, DOM and the Storybook suite stay unchanged; that is the acceptance test for this commit.

3. **`refactor(controls): let ToolRail take its tool list`**
   `ToolRail` accepts `tools`, a per-tool `disabledReason` and a control-id function, defaulting to today's constant. The app can then pass `drawingTools` and keep `surface.draw.tool.*` ids, `aria-disabled` and the hidden reason text that `DrawingReviewAdapter` renders now.

4. **`feat(editor): render drawing review through EditorWorkspace`**
   - New `src/ui/editor/drawing-review/DrawingWorkspace.tsx` (the application adapter). It creates `createDrawingReview` and `createDrawingTools` exactly as `DrawingReviewAdapter` does and maps them:

     | Shell prop                              | Source                                                                                                                                                        |
     | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
     | `layers`, `activeLayer`, select, toggle | `m.layers()`, `m.selected()`, `m.select`, `m.update(id, { visible })`, names via `layerName`                                                                  |
     | `tool`, `onTool`, reasons               | `t.tool()`, existing `select()` and `toolReason()`                                                                                                            |
     | `history`                               | `m.canStep`, `m.step`                                                                                                                                         |
     | `saveState`                             | `m.failed()` → error, `m.busy()` → saving, pending draft → draft, else saved                                                                                  |
     | `canvas` slot                           | existing `DrawingCanvas` wrapping `SurfacePhoto`                                                                                                              |
     | `toolOptions` slot                      | brush width / shape options from `DrawingInspector`                                                                                                           |
     | `inspectorDetail` slot                  | existing `DrawingInspector` point fields, `DrawingHistory` and `DrawingLayers` management, inside a "Details" disclosure that is open by default in this step |
     | `footerStart` slot                      | surface photos as a `PhotoStrip`                                                                                                                              |
     | `title`, `breadcrumb`                   | project, object and surface names from `SurfaceWorkspace`                                                                                                     |

   - `SurfaceDrawing` renders `DrawingWorkspace` instead of `DrawingReviewAdapter`. Keyboard shortcuts, the resolve-draft dialog, blocked reasons and every `surface.draw.*` control id move across unchanged, so `tests-platform/drawing-review.ts` needs no selector changes.
   - `copy` is passed from `drawingCopy(language)`, with new EN and HU keys for the shell strings that are English literals today.
   - `DrawingReviewAdapter` stays in the tree, unused by the route, until Phase 1 step 4 retires it.

5. **`test(editor): cover the converged editor in both orientations`**
   Extend `projects.browser.ts` screenshots for drawing mode at 1194 and 834, add an axe pass on the converged view, and add one test that draws a brush stroke by pointer and sees the layer's mark count change. Update `docs/handoff/README.md` and tick the roadmap item.

## Risks and how the plan handles them

- **Nested landmarks and height.** The shell is `<main>` at `100dvh`; the account layout already has a `main`. Handled in commit 2 (`as` prop, height variable). The surface route already uses the compact header via `.account-shell:has(.surface-heading)`.
- **Tool set mismatch.** Storybook has frame/crop, the app has shape and master. Commit 3 makes the list data, so neither side has to change tools in this step. Unifying the two lists is a design decision for step 2.
- **Control inventory.** `control-inventory.spec.ts` requires unique, populated contracts. Reusing the existing `surface.draw.*` registry avoids new entries; only genuinely new shell controls (focus canvas, mask opacity) get entries.
- **400-line limit.** `DrawingWorkspace.tsx` will inherit most of the 239-line adapter; the mapping helpers go in a sibling `workspace-props.ts` if it approaches the limit.
- **Hard-coded English in the shell.** Covered by the `copy` prop; Hungarian parity is part of commit 4's acceptance.
- **Inspector width.** The shell's inspector column is 288 px and the detail forms sit today in a column of `minmax(235px, 31%)` (about 370 px at 1194 wide), so they will be tighter and field rows may need to stack; portrait docking below the canvas needs a visual check.

## Out of scope for step 1

Making the canvas the primary input path and collapsing the numeric form (step 2), gesture pan/zoom and portrait layout work (step 3), deleting `DrawingReviewAdapter` and its styles (step 4), photo review and checkpoint review, per-layer areas in the Measurements tab beyond what `SurfaceMeasurements` already computes, and hiding layer UUIDs (Phase 2).

## Decisions needed from the owner

1. **Numeric point form.** Recommended: keep it, inside the "Details" disclosure, open by default in step 1 and closed by default from step 2. It is the keyboard and assistive-technology path and the existing tests rely on it.
2. **Where this lands.** Recommended: commits 1 to 3 go straight to `main` (no user-visible change); commit 4 goes through a short-lived branch and PR, because it replaces a shipped screen and deserves a screenshot review.
3. **390 px phone layout.** Recommended: keep it working but do not design for it in Phase 1; iPad landscape and portrait are the targets in `AGENTS.md`.
