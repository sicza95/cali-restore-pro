# Quality baseline review

14 November 2026 · Base commit `ae61835` · Re-checked the same evening against fresh screenshots (see [Re-check on current main](#re-check-on-current-main)) · **Re-scored 15 November 2026 at `67299d7`** (see [Re-score after Phases 1 to 4](#re-score-after-phases-1-to-4))

This review rates the repository as it stands after M-16 and sets the order of work to bring it to a consistent standard. Ratings are out of 10 and compare against a production-grade, single-team product, not against a prototype.

## Summary

| Area         | Rating (15 Nov) | Was (14 Nov) | One-line verdict (15 Nov)                                                                                               |
| ------------ | --------------: | -----------: | ----------------------------------------------------------------------------------------------------------------------- |
| Code quality |          8 / 10 |       7 / 10 | Every listed weakness fixed and guarded by tests; UI logic is still tested only end to end.                             |
| Architecture |          8 / 10 |       7 / 10 | Boundaries restored on both sides (Go domains, feature folders, router and app context); production qualification open. |
| UX           |          6 / 10 |       4 / 10 | Task language, steps and one navigation model; long form-heavy pages and button-driven photo setup remain.              |
| UI           |          6 / 10 |       5 / 10 | One shell, styled controls and one primary per view; dense rows still truncate and some panels are bare lists.          |

The 14 November verdicts and findings below are kept as the baseline; the [re-score](#re-score-after-phases-1-to-4) says which still hold.

The single most important finding: **the polished iPad editor in Storybook (`src/ui/editor/editor-workspace/EditorWorkspace.tsx`) is not used by the application.** The app's surface editor (`src/ui/account-access/projects/*`, `src/ui/editor/drawing-review/*`) is a separate, form-driven review UI. Bringing those together is the highest-value piece of work in the repository.

## How this was assessed

- Read `AGENTS.md`, `README.md`, `docs/plan/*`, `docs/source-layout.md`, the M-16 evidence and the last 25 commits.
- `tsc --noEmit` and `eslint . --max-warnings 0`: both pass.
- Rendered the built Storybook at 1194 × 834 and 834 × 1194.
- Viewed the Playwright screenshots of the real app from the last local run (`test-results/`, 14 Nov 16:11). **These predate `ae61835` (18:09), which reworked the shell and project styles**, so some app-screen findings below may already be partly addressed. Re-check against a fresh run.
- Not run here: Go tests, Docker stack, Playwright suites (not available in the first review environment).

## Re-check on current main

Run with the pinned Node 24 and installed Chrome at `ae61835`. The app suite ran against a freshly built, empty Compose project (`calirestore-qa-baseline`, removed afterwards), not the development stack.

| Command              | Result                         | Notes                                                                                                                                                                                                                                                                                                                        |
| -------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check`      | Pass                           | Typecheck, lint and format.                                                                                                                                                                                                                                                                                                  |
| `npm test`           | 9 passed, 2 failed (11)        | Reproduced twice. The first test on each of the two workers times out in `openStory`, waiting 5 s for `.cr-root` while the Storybook dev server compiles its first story. With `--retries=1` both pass and are reported flaky. CI sets `retries: 1`, so it is masked there. A cold-start problem in the test, not in the UI. |
| `npm run test:app`   | 14 passed, 2 failed, 1 skipped | `identity.spec.ts:38` and `settings.spec.ts:17` click "Sign out" and "Account profile" at 834 px, where `ae61835` moved the navigation behind the Menu button. The tests were not updated with the shell. `invitations.spec.ts` skips without its `M06_*` session variables.                                                 |
| `npm run test:files` | 21 passed                      | Not requested, but it is the suite that produces the project, photo, drawing, checkpoint, estimate and report screenshots this review is based on.                                                                                                                                                                           |

Not run: `npm run test:sync`, `npm run test:estimates`, `npm run build-storybook`, Go tests, backup and smoke scripts.

What the fresh screenshots change:

| Finding                                      | Status after re-check                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UX 1 · direct manipulation missing           | **Corrected. The original wording was wrong, not stale.** Drawing review has a tool rail (select, pan, brush, eraser, pen, shape, edit points, master) and `DrawingCanvas` handles pointer gestures for ink, points and pan. What holds is that the inspector leads with numeric point fields, so the form reads as the main path.                                                                                                                                     |
| UX 2 · internal data shown                   | Holds. Layer UUIDs and `0.00113388 ft²` in Surface measurements, "Retained commits · 13 / 30", "Encrypted input version · r1 … restoration-v1", and an ISO timestamp in the report preview.                                                                                                                                                                                                                                                                            |
| UX 3 · developer language                    | Holds. "Geometry is not connected yet", "Estimate backup/restore is not connected", "Independent mask scope", "Committed phase layer" and "Check connection" are all still on screen.                                                                                                                                                                                                                                                                                  |
| UX 4 · everything visible at once            | Holds, slightly better: estimate review is now two columns and about 2,235 px tall at 1194 wide. Still no steps or disclosure.                                                                                                                                                                                                                                                                                                                                         |
| UX 5 · inconsistent navigation               | Partly retired. The sidebar/Menu split is now one rule: sidebar from 1100 px, Menu drawer below it, and the compact Menu header on surface routes at every width (deliberate, to give the canvas room). Still open: the "Projects" page title above "Estimate review", and breadcrumbs that are bare underlined links.                                                                                                                                                 |
| UX 6 · small, passive canvas                 | Holds for photo review (Left / Right / Up / Down buttons, canvas about a third of the page). Drawing review in portrait gives the canvas most of the first screen.                                                                                                                                                                                                                                                                                                     |
| UI · native controls                         | Holds. The file input is unstyled on Original files and in Preferences; selects use the browser default arrow.                                                                                                                                                                                                                                                                                                                                                         |
| UI · weak button hierarchy                   | Partly addressed. Each panel now has one dark primary ("Apply mark", "Save estimate version", "Attach original"); secondary buttons are still many and equal in weight.                                                                                                                                                                                                                                                                                                |
| UI · truncated field rows                    | **Fixed** by #35 ([plan](../plan/estimate-rows.md)): estimate rows now show whole values. Was: "Object 1 / Surfac", "Current assessm" and "No mask assigne" in the estimate's three-column row.                                                                                                                                                                                                                                                                        |
| UI · sidebar floats mid-page                 | **Retired.** The sidebar is `position: sticky`; it only appears mid-page in full-page captures taken after scrolling. No change needed.                                                                                                                                                                                                                                                                                                                                |
| UI · sparse admin page                       | **Fixed** by #36 ([plan](../plan/admin-density.md)): in landscape, Accounts sits beside a column of Mail queue and Security events, so all four parts start in the first screen; portrait stacks the panels. Was: one column, with three of four parts below the first screen when there is data and two thirds of the width empty when there is none.                                                                                                                 |
| Storybook · portrait inspector and letterbox | **Fixed** by #37 ([plan](../plan/portrait-inspector.md)): in portrait the docked inspector takes the height its content needs, so every section shows unscrolled, its footer is a full-width row under the layers, and the photo starts at the canvas top. The app's drawing canvas still letterboxes in portrait (#74). Was: in portrait, Cracks and Work phases are out of sight, the inspector's right column is mostly empty, and there is a band above the photo. |

New findings from this run:

1. The shell refresh shipped with two failing app tests (above). Either the tests open the Menu first at narrow widths, or they run those steps at landscape width.
2. `openStory` in `tests/ui.spec.ts` needs a longer first-load timeout or a warm-up request, so `npm test` is green locally without retries.
3. Photo review shows "The assessment changed outside this editor. Discard the old recovery draft to resume editing." as plain text under the pan buttons, with no warning treatment. Fixed by #38 ([plan](../plan/warning-treatment.md)).

Ratings are unchanged (code 7, architecture 7, UX 4, UI 5). The corrected UX 1 finding does not move the UX rating: the capability exists, but the screen does not yet present it as the primary way to work. It does make Phase 1 smaller than first estimated, because step 2 is mostly re-housing existing canvas drawing rather than building it.

## Re-score after Phases 1 to 4

15 November 2026 · at `67299d7` (Phases 1 to 4 done; issues #29 to #32, #47, #57, #58 closed today). Evidence: a full local run of every suite (`check`, `test:unit` 210, `npm test` 16, `test:files` 22, `test:estimates` 8, `test:sync` 2, `test:app` 16 + 1 skipped, `build-storybook`), the fresh `test:files` screenshots at 1194 × 834 and 834 × 1194 (project, photo setup, drawing, checkpoints, estimate steps, outputs, admin), and a probe of visible primary actions per screen. Same scale as before: a production-grade, single-team product. Not done: Go tests (no Go change today), a physical iPad, Firefox and WebKit.

### Code quality — 8 / 10 (was 7)

All six weaknesses are fixed: Vitest covers `src/platform` (estimates, geometry, vault crypto, revision queue, report workbooks) plus UI-level guards, 210 tests in CI (1); one typed router with guards and deep links (2) and an app context instead of the prop-drilled model (3), [ADR 0006](../adr/0006-router-and-app-context.md); a typed EN/HU catalogue where a missing Hungarian key fails `typecheck` and `test:unit` (4, [plan](../plan/i18n-catalogue.md)); no file-level lint disables (5, [plan](../plan/lint-disables.md)); UI colours only from tokens, guarded (6, [plan](../plan/colour-tokens.md)). Guards now catch whole classes of regressions: copy parity and glossary terms, inline language choices, colour literals, raw floats on screen.

Why not 9: UI behaviour is tested only through Playwright (no component tests); several files sit at the 400-line limit (#44); the global `button` rule in `account-access/styles.css` still styles every app button and has caused white-on-white twice (process notes); and today a racy absence check hid a real leak, vault names left in the breadcrumb after locking, until it was traced (#58). Tests that can pass before data loads are a pattern worth auditing.

### Architecture — 8 / 10 (was 7)

All five weaknesses are fixed: `internal/identity` split into nine domain packages (1); `src/ui` split into `account/`, `settings/`, `projects/`, `project-review/`, `estimates/`, `reports/`, `sharing/` (2); one editor (3, retired earlier); a router and app context (4); one CI workflow with parallel jobs (5). Decisions are recorded as ADRs and every phase has a plan document.

Why not 9: `account-access/` still holds the app core and global styles, so the folder name and the CSS cascade still cross features; account pages mix in-app navigation and full page loads (#45); the shell's record names show that vault-scoped state needs an explicit lifetime (fixed for names in #58, but not yet a general rule); and production qualification is open (cryptographic review #52, deployment and recovery #53, sustained 4K/8K memory #50).

### UX — 6 / 10 (was 4)

| Finding (14 Nov)               | Now                                                                                                                                                                                  |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1 · direct manipulation        | Mostly retired by Phase 1: the canvas leads in drawing, with gesture zoom and pan; numeric entry sits behind "Enter by number".                                                      |
| 2 · internal data shown        | Retired: no ids or revisions on audited screens, numbers formatted per unit and language (guarded).                                                                                  |
| 3 · developer language         | Retired on audited screens and in every catalogue string (unit-tested since #30). Account, vault and admin screens had no screen audit, but their catalogue strings are now checked. |
| 4 · everything visible at once | Retired for the estimate: summary plus five steps, page about 1,490 px instead of 2,640.                                                                                             |
| 5 · inconsistent navigation    | Retired: one shell, drawer in portrait, real breadcrumbs, one title. The surface editor header no longer repeats the trail (#39).                                                    |
| 6 · small, passive canvas      | Held for photo setup (Left, Right, Up and Down buttons and a zoom slider); since retired there by gesture pan and zoom (#34). The checkpoint comparison pans with sliders.           |

Why 6 and not 7: the project page and photo setup are still long, form-first pages (the project page in portrait is about 2,160 px of equal-weight panels); Surface measurements is a bare list under the photo; no physical iPad and Pencil session yet (#49).

### UI — 6 / 10 (was 5)

Better: one shell in both orientations; selects with token chevrons, a styled file picker and accent checkboxes; one dark primary per view (probed); colours only from tokens in both themes. Still holding: Surface measurements and the checkpoint measurements are unstyled lists; the admin page is sparse on the right (**fixed** by #36); the Storybook portrait inspector clips and letterboxes (**fixed** by #37; the app's drawing canvas still letterboxes in portrait, #74). The app screens are now about a 6, the editor about an 8.

### What would move each rating next

- Code to 9: component tests for the editor and estimate state, the files at the limit split (#44; done 16 November: `projects.browser.ts`, `revision-queue.ts`, `vault/files.ts`, `drawing-review.ts`, `SurfaceReviewAdapter.tsx`, `VaultSection.tsx` and `invitations.spec.ts`), the global button rule scoped to the app shell.
- Architecture to 9: the `account-access/` core renamed and its global CSS scoped; #45 decided; #52 and #53 done.
- UX to 7: a lighter project page (disclosure for the rarely used panels), a physical iPad session (#49).
- UI to 7: styled measurement lists (#36 and #37 are done).

Done since this re-score (ratings not re-scored): photo setup by gesture (#34, 15 November); whole values in estimate rows (#35), one title per surface page (#39), a warning treatment for the recovery conflict (#38), the estimate's empty phase layer value named after its label (#65), no false recovery conflict when a photo is attached with drafts pending (#63, [plan](../plan/recovery-conflict.md)), the redundant `class="secondary"` removed from buttons and kept out by a unit test (#40), the Storybook portrait inspector showing every section with the photo at the canvas top (#37, [plan](../plan/portrait-inspector.md)), drawing drafts kept editable when a detail photo is removed (#67, [plan](../plan/removal-drafts.md)), the draft source photo blocked from removal and role changes on the project page as on the surface page (#72, [plan](../plan/draft-source.md)), the admin page as panels in two columns in landscape (#36, [plan](../plan/admin-density.md)), reference changes that would hide drawing drafts blocked on both pages (#75, [plan](../plan/reference-change.md)), the reason for a blocked original shown as text under its row instead of a hover tooltip (#79, [plan](../plan/visible-reason.md)), the drawing workspace's blocked layer Remove and tools saying why on touch, with Export left out of the embedded editor (#81, [plan](../plan/drawing-reasons.md)), the drawing notice following a language change while shown (#83, [plan](../plan/notice-language.md)), the `projects/project-route.ts` re-export shim deleted, with the estimate review files importing from the router directly (#41, [plan](../plan/router-context.md)) and the projects flow split into nine serial tests in `tests-platform/projects-flow/`, each with its own timeout in the spec (`projects.browser.ts` 399 to 77 lines; #44), followed by splits of `revision-queue.ts`, `vault/files.ts`, `tests-platform/drawing-review.ts`, `SurfaceReviewAdapter.tsx`, `VaultSection.tsx` (400 to 328 lines, setup controls in `VaultSetup.tsx`) and `invitations.spec.ts` (398 to 318 lines, first share step in `invitation-share.ts`), which completes #44's file splits, and `invitations.spec.ts` running in CI's Platform E2E job with synthetic sessions seeded by the platform config's global setup, issuing an estimate before it shares estimate scopes (#86), all 16 November 2026.

## Code quality — 7 / 10

Strengths

- Strict TypeScript, ESLint and Prettier clean with zero warnings; no `any` casts outside generated code.
- The 400-line file limit is enforced by ESLint and actually respected (largest authored file: 400 lines).
- Generated OpenAPI client with a CI drift check (`api:generate && git diff --exit-code`).
- Go code is idiomatic `net/http` + `pgx`, explicit SQL migrations (21), and 15 Go test files including integration tests.
- Dependencies are pinned exactly; `npm audit` and `govulncheck` run in CI.
- Conventional, signed commits with meaningful messages.

Weaknesses

1. **No frontend unit tests.** ~12k lines in `src/platform/` (decimal estimate maths, polygon geometry, vault crypto, revision queue) are only exercised through Playwright. Logic of this kind needs fast, deterministic unit tests with test vectors.
2. **Hand-rolled routing.** Routes are parsed from `location.pathname` per feature (`project-route.ts` etc.) with ad-hoc `pushState`. Deep links, back/forward and guards are re-implemented in several places.
3. **Prop-drilled god model.** Components receive `model: ReturnType<typeof createAccountAccess>`, coupling every feature to the account module's internal shape.
4. **Scattered i18n.** ~70 files hold their own `copy[language]` objects (EN/HU). There is no catalogue, no missing-key check and no pluralisation/number-format layer.
5. **Lint suppressions at file level** (`/* eslint-disable solid/reactivity */` in `ProjectWorkspace.tsx`) hide genuine reactivity mistakes along with the intended ones.
6. **Hard-coded colours** (45 hex literals in feature CSS) bypass the token system the README requires.

## Architecture — 7 / 10

Strengths

- Clear deployment topology: app, worker and one-shot migrator share one immutable image; read-only root filesystem, `cap_drop: ALL`, `no-new-privileges`, secrets as files, separate migrator and app DB roles, private object volume.
- Client-side encryption design with documented grants, revocation and recovery, plus backup/restore smoke tests in CI.
- The plan pack (`docs/plan/`) documents decisions, trade-offs and requirement coverage unusually well.

Weaknesses

1. **Go `internal/identity` is a god package.** Its 40 files cover accounts, sessions, admin, files, revisions, invitations, sharing, hosting transfer, deletion and retention. Package boundaries should follow the domain: `accounts`, `sessions`, `files`, `projects`/`revisions`, `sharing`, `retention`, with `identity` kept to identity.
2. **Frontend feature naming has drifted.** `src/ui/account-access/` now contains projects, reports, estimates and invitations — effectively the whole product. The folder name no longer describes its contents.
3. ~~**Two editor implementations.**~~ **Retired 15 November 2026** by Phase 1 (steps 1 to 4): the app's surface editor is `EditorWorkspace`, and the old `DrawingReviewAdapter` is deleted. The rating stays at 7, because weaknesses 1, 2, 4 and 5 still hold. Was: Storybook's `EditorWorkspace` (design target) vs. the app's `SurfaceWorkspace` + `drawing-review` (what ships).
4. **No app-level state/route layer.** Each feature owns fetching, routing and persistence, which is why prop-drilling and duplicated route parsing appear.
5. **CI duplication.** Two workflows each install and build; the platform job is a long serial chain that is hard to read when it fails.

## UX — 4 / 10

Based on the app screenshots (projects, photo, drawing, checkpoint, estimate, report, admin; landscape, portrait and 390 px).

1. **Direct manipulation is under-presented.** _(Corrected after the re-check; the first version said it was missing.)_ Pointer drawing exists on the drawing canvas, but the inspector leads with "New point horizontal (%)" and "Add point", so typing points reads as the primary path. On an iPad-with-Pencil product the canvas should lead and the form should be an accessibility fallback.
2. **Internal data is shown to users.** _(Partly retired 15 November 2026 by the [copy audit](../plan/copy-audit.md): no UUIDs, revision numbers or calculation versions on the audited screens, guarded by `copy-guard.ts`. Raw floats remain until Phase 2 item 2.)_ Was: layer UUIDs (`630298c4-…`), raw floats (`0.00113388 ft²`), "Encrypted input version · r4 · restoration-v1", "Retained commits 13 / 30".
3. ~~**Developer language in copy.**~~ **Retired 15 November 2026** by the [copy audit](../plan/copy-audit.md) and its [glossary](../copy-glossary.md); the account, vault and admin screens were not audited. Was: "Committed phase layer", "Independent mask scope", "Geometry is not connected yet", "Estimate backup/restore is not connected", "Check connection". Users need task language; engineering status belongs in docs.
4. **Everything is visible at once.** Estimate review is one 2,600 px column of phases, presets, scope, extras, adjustments and archives. Needs progressive disclosure (steps, collapsible sections, a summary-first layout).
5. **Navigation is inconsistent.** Some screens use a sidebar, others a top "Menu" button; the estimate page carries a "Projects" page title above "Estimate review"; breadcrumbs are bare underlined links.
6. **Canvas is small and passive.** On the photo review screen the image is a fraction of the viewport, with pan done via "Left / Right / Up / Down" buttons.

What is good: states are explicit and honest (saved locally vs. synced, offline, failed save), validation messages are specific, keyboard focus and labels are consistently present, and Hungarian localisation exists.

## UI — 5 / 10

- **Storybook editor: ~8.** Calm dark/light themes, a clear left tool rail, opaque inspector, legible measurements, good use of the photo. Minor issues: in portrait the inspector is clipped (Cracks and Work phases scroll out of sight) while its right column is mostly empty, and the canvas has a large letterbox above the photo.
- **App screens: ~4.** Native unstyled controls (file input "Choose file", default selects), many equal-weight grey buttons with weak hierarchy, cramped three-column field rows with truncated values ("Object 1 / Surfac…", "Current assessm…"), sparse admin page with large empty areas.

## Roadmap to a good standard

Each step is meant to be one or a few signed conventional commits, each recorded in its plan doc.

### Phase 0 — Working agreement

- [x] This review.
- [x] Re-run Playwright on current `main` and correct or retire findings that no longer hold (see [Re-check on current main](#re-check-on-current-main)).
- [x] Fix the two app tests broken by the shell refresh and the cold-start timeout in `tests/ui.spec.ts`. The app tests open the Menu disclosure when it is showing; `npm test` loads one story in a global setup before the workers start. `npm test` 11/11 from a cold server, `npm run test:app` 16 passed, 1 skipped.

### Phase 1 — Converge the editor (highest value)

1. [x] Make `EditorWorkspace` the application's surface editor: wire it to the real project store, layers, masks and history used by `drawing-review`. Done in the five commits of [editor convergence](../plan/editor-convergence.md); `projects.browser.ts` covers the converged editor at 1194, 834 and 390 px with screenshots, an axe pass at each width and a pointer brush stroke.
2. [x] Make the existing pointer/Pencil drawing the primary path inside `EditorWorkspace`; keep the numeric form as an accessible fallback behind a disclosure. Done in the six commits of [pointer drawing first](../plan/editor-pointer-first.md): Apply, Cancel and a point count in the canvas chip with Enter and Escape, one layer list, drafts and descriptive undo outside the disclosure, and "Enter by number" closed by default. `projects.browser.ts` covers pen, Escape and rectangle input with the disclosure closed, plus screenshots and axe at 1194, 834 and 390 px closed and open.
3. [x] Canvas-first layout: pan/zoom by gesture and wheel, inspector docks below in portrait, tool rail left. Done in the seven commits of [canvas-first layout](../plan/editor-canvas-first.md): Ctrl/⌘ + wheel, trackpad pinch and `+` `-` `0` zoom to 800 % around the pointer, compact footer zoom, the photo fitted to the canvas, a two-height portrait inspector, compact surface pickers in drawing mode and a docked tool chip at phone width. `projects.browser.ts` covers wheel, keys, footer zoom, the photo fit and both inspector heights, with screenshots and axe at 1194, 834 and 390 px.
4. [x] Retire the duplicate review components once parity tests pass. Done in the four commits of [retire the duplicate review components](../plan/editor-retire-adapter.md): a parity test (`drawing-review.ts` checks that the rendered `surface.draw.*` ids equal the registry, all 67), then `DrawingReviewAdapter` and its styles deleted, then one host for the drawing panels and four unread copy keys removed. The drawing screenshots show no visible change.

### Phase 2 — UX and copy pass

Target devices (decided 2026-11-15): iPad and desktop only. Phone widths (390 px) are not supported for now, so no Phase 2 item adds phone layouts. The 390 px test checks were removed on 15 November 2026 (issue #47).

1. [x] Copy audit: replace engineering terms with task language, move "not connected yet" notes to docs, hide IDs. Done in the eight commits of the [copy audit](../plan/copy-audit.md): a [glossary](../copy-glossary.md) in EN and HU, task language on the estimate, editor, report and footer, the backup limit moved to the backup panel (with a fix for its misleading error), no internal ids, a translated save status, and `copy-guard.ts` checking ten screens. The UX rating stays at 4 until the estimate page and app shell (items 3 and 4) land; findings 4 to 6 still hold.
2. [x] Shared number/unit formatting through `Intl.NumberFormat` with unit-appropriate precision (m², cm², ft²) and locale-aware decimals. Done in PR #21 ([plan](../plan/number-format.md)).
3. [x] Restructure estimate review as summary + steps (Scope → Phases → Extras → Adjustments & tax → Issue). Done in PR #26 ([plan](../plan/estimate-steps.md)): summary plus five steps, one primary per step.
4. [x] One app shell: sidebar in landscape, compact header + drawer in portrait; real breadcrumbs. Done in `eaad337` ([plan](../plan/app-shell.md)), confirmed 15 November 2026: sidebar, icon rail on surface pages, compact header with a modal drawer (focus trapped, Escape and focus return tested in `navigation.spec.ts`), chevron breadcrumbs from the route table with `aria-current`, one shell `h1`. The surface editor's own header no longer repeats the trail, and the object name is a plain-text step in the shell trail (#39, [plan](../plan/surface-header.md)). Breadcrumb names now leave the shell when the vault locks (#58).
5. [x] Styled file picker, select and button hierarchy (one primary per view). Done in `eaad337`, `c6f302b`, `20ed0c8` ([plan](../plan/styled-controls.md)), confirmed 15 November 2026: secondary is the default button (the redundant `class="secondary"` attributes were removed in #40), selects and the file picker are styled, checkboxes take the accent token. A probe counted the visible primaries on every screen the copy guard visits: one each (or none), except the checkpoints tab, where the embedded pattern editor's Save was a second primary; it is now primary only on the libraries page.

### Phase 3 — Code structure

1. [x] Add Vitest for `src/platform/**` with test vectors for estimates, geometry, vault crypto and revision queue; run it in CI. Done in PR #24, landed via #25: 182 tests, CI job "Unit tests (Vitest)".
2. [x] Introduce one router module (typed routes, guards, deep links) and an app context replacing the prop-drilled `model`. Done in PR #27 ([plan](../plan/router-context.md), [ADR 0006](../adr/0006-router-and-app-context.md)): `src/ui/router/` and `src/ui/app-context/`.
3. [x] Central i18n catalogue with typed keys and a missing-translation check. Done in issue #30 ([plan](../plan/i18n-catalogue.md)): `src/platform/i18n/`, `defineCopy` type check plus unit tests for parity, banned terms and inline language choices.
4. [x] Rename `src/ui/account-access/` into feature folders (`account/`, `projects/`, `estimates/`, `reports/`, `sharing/`). Done in issue #29: also `settings/` and `project-review/` (the page shared by estimates and reports); `account-access/` keeps only the shared app core. Pure moves, no behaviour change.
5. [x] Split Go `internal/identity` into domain packages without behaviour changes; keep tests green at each step. Done in PR #22, landed via #25: nine domain packages.
6. [x] Replace hard-coded colours with tokens; remove file-level lint disables. Lint disables done in issue #32 ([plan](../plan/lint-disables.md)). Colours done in issue #31 ([plan](../plan/colour-tokens.md)): UI colours come from `tokens.css`, guarded by `test:unit`.

### Phase 4 — Delivery hygiene

1. [x] Merge the two CI workflows into one with parallel jobs (frontend checks, Go tests, platform E2E). Done in PR #20: `ci.yml`.
2. [x] Consolidate `docs/m*.md` under `docs/milestones/` and add a one-page architecture overview with ADRs for future decisions. Done in PR #23, landed via #25: [milestones](../milestones/), [overview](../architecture.md), [ADRs](../adr/).
