# Admin density

16 November 2026 · Status: in progress · Issue: #36 · Source: [quality baseline](../reviews/2026-11-14-quality-baseline.md#ui--5--10), row "UI · sparse admin page"

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
