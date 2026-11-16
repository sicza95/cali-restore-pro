# Admin density

16 November 2026 · Status: done · Issue: #36 · Source: [quality baseline](../reviews/2026-11-14-quality-baseline.md#ui--5--10), row "UI · sparse admin page"

Goal: at iPad landscape (1194 × 834) the administration page shows account search, the mail queue, its recent jobs and the security events side by side without empty columns; in portrait (834 × 1194) they stack. Behaviour, copy, controls and data stay as they are. iPad and desktop only ([ADR 0003](../adr/0003-ipad-and-desktop-only.md)).

## Where things stand

`src/ui/settings/admin/Admin.tsx` renders two full-width `.admin-section`s: Accounts (search, password confirmation, account list, paging) and Mail queue (refresh, three counts, the "Recent mail jobs" disclosure, then the security events under their own `h2`). Every part is one column of the 886 px content box (768 px in portrait), and the forms are capped at 26rem. Only `test:app` reaches the page, with mocked reads in `tests-platform/settings.spec.ts` and `navigation.spec.ts`; no Storybook story covers it.

Measured on `main` at `e7e92af` with synthetic data: 8 accounts (some emails over 80 characters) and a next page, mail counts 3 / 1,248 / 2, the server's limits of 20 mail jobs and 25 security events ("rows"), and with nothing ("empty"). Light, dark, EN and HU measure the same unless noted.

| Viewport, state | Page height | First screen                                                                       | Empty width to the right of each part's content (of 886 / 768 px)            |
| --------------- | ----------: | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 1194, rows      |    3,005 px | Accounts only; Mail queue starts at y 988, jobs at 1,156, security events at 1,200 | rows fill the width; security events are 1,659 px tall                       |
| 1194, empty     |      981 px | all four, in one column                                                            | Accounts 280 (HU 264), Mail queue 682 (HU 607), security events 557 (HU 413) |
| 834, rows       |    3,579 px | Accounts only; Mail queue starts at y 1,048                                        | rows fill the width; security events are 2,184 px tall                       |
| 834, empty      |    1,194 px | all four                                                                           | Accounts 162 (HU 145), Mail queue 563 (HU 488), security events 439 (HU 295) |

So in landscape the page is a single column: with data, three of the four parts are below the first screen; without data, two thirds of the width is empty beside the counts and the forms. Loading and error states were captured too (one status line; the shell's error message and no lists).

## Approach

1. **Three panels in a two-column grid in landscape.** Accounts (search, confirmation, list, paging) is the left column; Mail queue (counts, refresh, the jobs disclosure) and Security events stack in the right column, and the last panel grows so both columns end together. The panels reuse `.account-panel` (opaque, tokens in both themes). Columns are `repeat(auto-fit, minmax(24rem, 1fr))`, so an account with only one of the two permissions gets one full-width column instead of an empty one.
2. **Portrait (below 1100 px, the shell's breakpoint) stacks the panels** full width in reading order: Accounts, Mail queue, Security events.
3. **Fill each panel's width.** The search and confirmation fields stretch beside their buttons; Refresh sits on the Mail queue heading row; the counts share the row width. Long emails and ids keep wrapping inside their panel.
4. Security events become their own `section` with the same `h2`, help and list, rendered when the operations data is there, as today. Control ids, copy, the disclosure, the one primary (Search) and the order of controls stay.

## Verification

- New `tests-platform/admin-layout.browser.ts` in `test:files`, all reads mocked (`admin-fixtures.ts`): at 1194 × 834 with rows and empty, EN and HU, light and dark: the four parts (Accounts, Mail queue, Recent mail jobs, Security events) start in the first screen; at every 20 px line of the first screen the panels cover the content width with gaps of at most 32 px (no empty column); in each panel the rightmost text or control ends in the right quarter of the panel. At 834 × 1194: the panels are full width, stacked in reading order without overlap. Both sizes: no sideways scroll, no content past the sheet, 44 px targets, task language via the copy guard on the empty page, axe clean. It must fail on `main`. The guard cannot run on the page with rows unchanged: the mail jobs and security events show opaque ids (UUIDs) on purpose ("Events show time, action, and opaque account IDs."), and this issue does not change data.
- `settings.spec.ts`, `navigation.spec.ts` and the control inventory unchanged and green under `test:app` on a disposable Compose project.
- `npm run check`, `test:unit`, `npm test`, `test:files`, `build-storybook`; screenshots at 1194 and 834, light and dark, EN and HU, rows and empty.

## Outcome

| Viewport, state | Page height (was) | First screen (was)                    | Panels                                                                                           |
| --------------- | ----------------: | ------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 1194, rows      |  2,845 (3,005) px | all four (Accounts only)              | Accounts 391 px wide; Mail queue and Security events 469 px; security events at y 353            |
| 1194, empty     |      834 (981) px | all four, in two columns (one column) | empty width right of the content: Accounts 25 (280), Security events 116, HU 31 (557, HU 413) px |
| 834, rows       |  3,651 (3,579) px | Accounts (Accounts)                   | stacked, 766 px wide                                                                             |
| 834, empty      |  1,194 (1,194) px | all four (all four)                   | stacked; Mail queue's counts and Refresh span the width (was 563 px empty)                       |

HU at 1194 with rows: 2,722 px. Changes from the approach above:

- **Columns are 5 : 6, not auto-fit.** In a 50 : 50 split each security event's two ids took three lines (the HU "Végrehajtó: … ·" line is 412 px), which made the right column 2,346 px of 2,600. The 469 px right column keeps them to two lines in EN and HU. Portrait and pages with one of the two permissions get one column (`:has()`).
- **The test's no-empty-column rule** is per column rather than per 20 px line: the parts' columns tile the content width with gaps of at most 32 px, each column's panels cover the first screen (from the panels' top to the viewport bottom or the panels' end) less 32 px per gap between stacked panels, and each panel's rightmost text or control ends in its right quarter. The jobs disclosure starts at least 44 px above the first screen's bottom. On `e7e92af` all eight cases fail: with rows, Mail queue starts at y 988; empty, the counts' column covers 361 of 703 px.
- Long emails use `word-break: break-all` in the account list: in the narrower left column, a 55-character email otherwise left the disclosure marker alone on its line.
- With rows, the columns end together, so the Accounts panel has about 1,450 px of empty panel below eight accounts (a full page of 20 accounts roughly fills it). Loading and error show the panels with their status line or the shell's message.
- The copy guard runs on the empty page only (see Verification); the jobs and events still show opaque ids, as the help text says.
