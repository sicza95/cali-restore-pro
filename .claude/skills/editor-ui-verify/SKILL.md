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
the handoff when they were not run. Never run `test:app` at the same time as `npm test`: `npm test`
deletes `test-results/` and `test:app` then fails with ENOENT on its trace files.

## Proving a change has no visible effect

1. Before the change, copy `test-results/**/drawing-*.png` to `../.analysis/claude-tmp/<step>-base/`.
2. After `test:files`, copy them to `<step>-after/` and run
   `node ../.analysis/claude-tmp/pixdiff.cjs "$PWD" <base> <after> <files…>`. It decodes the PNGs in
   system Chrome (`channel: 'chrome'`; Playwright's bundled browser isn't installed) and prints the
   differing pixels. Byte equality alone isn't enough, since PNG bytes vary.
3. Run the same flow twice on the new code to see the noise. Known noise: `drawing-390-closed.png`
   rows 508 to 551 change between identical runs, and antialiased photo or mask edges can differ by
   one unit in a few dozen pixels. A real layout change moves whole regions.

## Finding unread copy keys

`node ../.analysis/claude-tmp/unread-copy.cjs "$PWD"` lists `drawing-review/copy.ts` keys with no
`.key` reader under `src` and no string literal in the files that index the copy dynamically.
Check each result by hand: `checkpointChange` and `photoChange` come from `surface-journal.ts`, and a
key can look read through another copy object with the same name (`SurfaceCopy.fit`).

## Traps

- **Inline scripts lose backslashes.** Heredocs through the Bash tool can drop `\\` in regexes. Write helper scripts with the Write tool.

- **Don't edit files while the verify chain runs.** `format:check` reads the half-edited file and
  stops the chain. Finish edits and `prettier --write` first.

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
- **Absolutely positioned grid children:** `grid-area: 1 / 1` is not enough; an `auto` end line
  is the container's edge for abspos items. Give explicit end lines (`1 / 1 / 2 / 2`). The phone
  dock in `responsive.css` relies on this.
- **Inspector body scroll.** `LayerPanel` reveals the selected row when the selection, height or
  tab changes and when a disclosure in its body closes (capture-phase `toggle`, which doesn't
  bubble). It does not reveal on open, so opened fields stay in view.
- **Background verify chains, last step:** Git Bash's `tail` takes one `-n N` for several files,
  not `-4`; a bad `tail` turns a green chain into exit 1.
- New controls need an entry in `src/ui/editor/drawing-review/registry.ts`, or
  `control-inventory.spec.ts` fails.
- Keep `DrawingWorkspace.tsx` and `DrawingCanvas.tsx` small; new logic goes in new files (400-line
  limit).
