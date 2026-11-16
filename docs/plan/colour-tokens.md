# Colour tokens — Phase 3, item 6 (first half)

15 November 2026 · Status: done · Issue: #31 · Source: [quality baseline](../reviews/2026-11-14-quality-baseline.md), Phase 3 item 6 and code finding 6

Goal: every colour the UI paints comes from `src/ui/tokens.css`, and a test stops new literals. Screens look the same, except for two small changes made on purpose (below). The second half of item 6, removing file-level lint disables, is separate.

## Where things stand

Found on `main` at `a185a6e`. The baseline counted 45 literals; earlier work removed most. What is left:

| Literal                                                          | Where                                                                          | Kind                                          |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------- |
| `rgb(0 0 0 / 35%)`                                               | `app-shell/styles.css`, drawer backdrop                                        | UI                                            |
| `rgb(10 15 18 / 55%)`, `rgb(0 0 0 / 48%)`                        | `calibration-dialog/styles.css`, `drawing-review/styles.css`, dialog backdrops | UI                                            |
| `#172936`, `#f7f7f5`                                             | `access-form/styles.css`, the sign-in photo panel                              | UI                                            |
| `#252b2e`, `#20282e`, `#fff`                                     | `photo-canvas/styles.css` caption, `photo-strip/styles.css` thumbnail label    | UI, labels over photos                        |
| `#f2ce82` (twice), `#f1cf86`                                     | `photo-canvas/styles.css` mask strokes, `PhotoCanvas.tsx` hatch pattern        | UI, mask guide over photos                    |
| `#ffc875`, `#64dae9`                                             | `drawing-review/constants.ts`, default colour of a new layer                   | Data: saved into the drawing document         |
| `#000000`                                                        | `settings/preferences/utils.ts`, `reports/useReport.ts`, default report accent | Data: a user preference                       |
| `#316783`, `#9c4138`, `#202429`, `#4b555e`, `#ffffff`, `#dbd1bc` | `src/platform/projects/patterns.ts`, `src/platform/reports/*`                  | Data and exported files (PDF, SVG, PNG, maps) |

## Approach

1. **Tokens** in `tokens.css`, in the shared `.cr-root` block, because these sit over photos or behind modals and are the same in both themes today:
   - `--cr-backdrop` (drawer) and `--cr-dialog-backdrop` (modal dialogs).
   - `--cr-photo-label` and `--cr-photo-label-ink` for text over photos (canvas caption, thumbnail label).
   - `--cr-mask-guide` for the crack, treatment and hatch strokes.
   - `--cr-specimen` and `--cr-specimen-ink` for the sign-in photo panel.
2. **Intended changes**: both modal dialogs use one backdrop (`rgb(10 15 18 / 55%)`; the drawing dialog was `rgb(0 0 0 / 48%)`), and thumbnail labels use the canvas caption colour (`#252b2e`, was `#20282e`). The hatch stroke uses the mask guide colour (`#f2ce82`, was `#f1cf86`). Each difference is under 8 % lightness and keeps one value per role.
3. **The SVG hatch** moves from a `stroke` attribute to a class, because presentation attributes can't read custom properties.
4. **Exceptions, documented in the test**: data defaults (new layer colours, the report accent) are values the user can change and that get saved, so they stay literal. `src/platform` is not UI: exported files must look the same in any theme.
5. **Guard**: `src/ui/colour-literals.test.ts` (`test:unit`) fails on any hex, `rgb()` or `hsl()` literal in `src/ui/**/*.{css,ts,tsx}` and `src/stories/**` outside `tokens.css` and the listed exceptions. Vitest's include widens from `src/ui/router/**` to `src/ui/**`.

`::backdrop` takes custom properties from its dialog in current Chrome (122+), Safari (17.4+) and Firefox (120+), which covers the iPad and desktop targets.

## Verification

`npm run check`, `test:unit` (with a temporary literal to see the guard fail), `npm test`, `test:files`, `build-storybook`; light and dark screenshots of the sign-in page, the photo canvas, a dialog and the drawer compared with `main`.

## Outcome

- Seven tokens in `tokens.css`; every UI colour literal outside it is gone. The hatch line is a class (`.cr-hatch-line`).
- `src/ui/colour-literals.test.ts` guards `src/ui` and `src/stories`; a temporary `#123456` in `app-shell/styles.css` failed it.
- Pixel diff of every `test:files` and `npm test` screenshot against `main`: the only changes are timestamps, the dialog backdrop (report preview, delta up to 13 of 255), and the hatch and thumbnail label (delta up to 6). Two full-page screenshots changed height because of leftover page height in a flaky baseline run; their content is the same.
- `project-reviews.browser.ts` failed once on `main` and once after the change, at the same line: issue #58.
