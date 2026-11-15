---
name: editor-ui-verify
description: How to verify a change to the CaliRestore Pro surface editor or drawing canvas — which suites to run, how to run one browser flow fast, and known test traps. Use after changing anything under src/ui/editor or tests-platform drawing helpers.
---

# Verify editor UI changes

Living skill: add traps as they are found; drop ones that no longer apply.

## Fast loop

- One flow: `npx playwright test --config playwright.files.config.ts projects.browser.ts`
  (about 30 s; it walks drawing input, pointer paths, drawing review and checkpoints).
- Drawing helpers live in `tests-platform/`: `drawing-input.ts`, `drawing-review.ts`,
  `canvas-zoom.ts`. `drawingControl(page, key)` finds `surface.draw.<key>`.

## Before committing

Run all of these; write logs to `../.analysis/claude-tmp/`, never the repo. Run them in the
background, since together they take several minutes.

```bash
npm run check && npm run build-storybook && npm test && npm run test:files
```

`test:app`, `test:sync`, `test:estimates` and Go tests need extra setup (see `CLAUDE.md`); say in
the handoff when they were not run.

## Traps

- **A plain wheel at fit scrolls the page.** Any test that wheels and then uses client
  coordinates must re-measure (`boundingBox()`) afterwards.
- **Checking whether the canvas cancelled a wheel:** a passive `window` wheel listener runs after
  the canvas's, so it can read `event.defaultPrevented`.
- Playwright applies held modifiers (`keyboard.down('Control')`) to `mouse.wheel`, so that is how to
  simulate trackpad pinch.
- **White on white in the app.** The app's global `button` rule sets white text, and shell buttons
  (`Button`, `IconButton`) don't set a colour. Storybook looks fine; the app doesn't. Set
  `color: var(--cr-ink)` on them and always look at the app screenshots.
- **The tool rail covers the photo's left edge.** The photo is fitted to the canvas (step 3 commit 3),
  so taps by photo percentage near the left edge hit rail buttons. Tap clear of it; when a tap draws
  nothing, check `document.elementFromPoint` at the tap point first.
- **Leave "Details" as you found it.** The portrait loop in `drawing-review.ts` ends with Details
  open, and the steps after it click controls inside it (`brush.dot`). A check that closes Details
  must reopen it.
- **Screenshot the editor, not the viewport, at 390 px.** The surface page chrome pushes the editor
  below the fold; use `locator('.drawing-workspace .cr-editor').screenshot()`.
- **Look at the tall portrait inspector.** The canvas must stay taller than the tool rail plus the
  chip; `--cr-canvas-min` in `responsive.css` holds that.
- **Selects built with `<For>` options:** set `selected` on the option too, not only `value` on the
  select; effect order can leave the first option shown. Check select text in screenshots.
- **Background verify chains:** echo a marker after each step (`&& echo CHECK OK`) and read the
  markers; the task's exit code says nothing when the chain ends with `; tail`. Run
  `npx prettier --write` on touched files first.
- New controls need an entry in `src/ui/editor/drawing-review/registry.ts`, or
  `control-inventory.spec.ts` fails.
- Keep `DrawingWorkspace.tsx` and `DrawingCanvas.tsx` small; new logic goes in new files (400-line
  limit).
