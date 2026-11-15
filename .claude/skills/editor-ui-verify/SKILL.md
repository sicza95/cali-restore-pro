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
- New controls need an entry in `src/ui/editor/drawing-review/registry.ts`, or
  `control-inventory.spec.ts` fails.
- Keep `DrawingWorkspace.tsx` and `DrawingCanvas.tsx` small; new logic goes in new files (400-line
  limit).
