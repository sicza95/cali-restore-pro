# Quality baseline review

14 November 2026 · Reviewer: Claude (first session) · Base commit `3c33d33`

This review rates the repository as it stands after M-16 and sets the order of work to bring it to a consistent standard. Ratings are out of 10 and compare against a production-grade, single-team product, not against a prototype.

## Summary

| Area         | Rating | One-line verdict                                                                                                        |
| ------------ | -----: | ----------------------------------------------------------------------------------------------------------------------- |
| Code quality | 7 / 10 | Disciplined and clean at file level; weak at unit-test depth and at cross-cutting concerns (routing, i18n, state).      |
| Architecture | 7 / 10 | Strong deployment and security posture; module boundaries have eroded on both the Go and the SolidJS side.              |
| UX           | 4 / 10 | The product works end to end, but most screens read as an integration-test harness rather than a tool for conservators. |
| UI           | 5 / 10 | The Storybook editor is close to an 8; the shipped app screens are closer to a 4. The two have diverged.                |

The single most important finding: **the polished iPad editor in Storybook (`src/ui/editor/editor-workspace/EditorWorkspace.tsx`) is not used by the application.** The app's surface editor (`src/ui/account-access/projects/*`, `src/ui/editor/drawing-review/*`) is a separate, form-driven review UI. Bringing those together is the highest-value piece of work in the repository.

## How this was assessed

- Read `AGENTS.md`, `README.md`, `docs/plan/*`, `docs/source-layout.md`, the M-16 handoff and the last 25 commits.
- `tsc --noEmit` and `eslint . --max-warnings 0`: both pass (run in a Linux VM on Node 22; the repo pins Node 24).
- Rendered the built Storybook at 1194 × 834 and 834 × 1194.
- Viewed the Playwright screenshots of the real app from the last local run (`test-results/`, 14 Nov 16:11). **These predate `3c33d33` (18:09), which reworked the shell and project styles**, so some app-screen findings below may already be partly addressed. Re-check against a fresh run.
- Not run here: Go tests, Docker stack, Playwright suites (no Docker or Go in the review environment).

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
3. **Two editor implementations.** Storybook's `EditorWorkspace` (design target) vs. the app's `SurfaceWorkspace` + `drawing-review` (what ships). Any design work done in Storybook does not reach users.
4. **No app-level state/route layer.** Each feature owns fetching, routing and persistence, which is why prop-drilling and duplicated route parsing appear.
5. **CI duplication.** Two workflows each install and build; the platform job is a long serial chain that is hard to read when it fails.

## UX — 4 / 10

Based on the app screenshots (projects, photo, drawing, checkpoint, estimate, report, admin; landscape, portrait and 390 px).

1. **Direct manipulation is missing.** Drawing a mask means typing polygon points as "New point horizontal (%)" and pressing "Add point". On an iPad-with-Pencil product, shapes must be drawn on the canvas; the form should be an accessibility fallback, not the primary path.
2. **Internal data is shown to users.** Layer UUIDs (`630298c4-…`), raw floats (`0.00113388 ft²`), "Encrypted input version · r4 · restoration-v1", "Retained commits 13 / 30".
3. **Developer language in copy.** "Committed phase layer", "Independent mask scope", "Geometry is not connected yet", "Estimate backup/restore is not connected", "Check connection". Users need task language; engineering status belongs in docs.
4. **Everything is visible at once.** Estimate review is one 2,600 px column of phases, presets, scope, extras, adjustments and archives. Needs progressive disclosure (steps, collapsible sections, a summary-first layout).
5. **Navigation is inconsistent.** Some screens use a sidebar, others a top "Menu" button; the estimate page carries a "Projects" page title above "Estimate review"; breadcrumbs are bare underlined links.
6. **Canvas is small and passive.** On the photo review screen the image is a fraction of the viewport, with pan done via "Left / Right / Up / Down" buttons.

What is good: states are explicit and honest (saved locally vs. synced, offline, failed save), validation messages are specific, keyboard focus and labels are consistently present, and Hungarian localisation exists.

## UI — 5 / 10

- **Storybook editor: ~8.** Calm dark/light themes, a clear left tool rail, opaque inspector, legible measurements, good use of the photo. Minor issues: in portrait the inspector is clipped (Cracks and Work phases scroll out of sight) while its right column is mostly empty, and the canvas has a large letterbox above the photo.
- **App screens: ~4.** Native unstyled controls (file input "Choose file", default selects), many equal-weight grey buttons with weak hierarchy, cramped three-column field rows with truncated values ("Object 1 / Surfac…", "Current assessm…"), a sidebar whose items float vertically in the middle of a long page, sparse admin page with large empty areas.

## Roadmap to a good standard

Each step is meant to be one or a few signed conventional commits, with the handoff updated afterwards.

### Phase 0 — Working agreement (this session)

- [x] `CLAUDE.md`, shared handoff (`docs/handoff/README.md`), this review.
- [ ] Re-run Playwright on `3c33d33` and replace stale screenshots in this review where findings no longer hold.

### Phase 1 — Converge the editor (highest value)

1. Make `EditorWorkspace` the application's surface editor: wire it to the real project store, layers, masks and history used by `drawing-review`.
2. Pointer/Pencil drawing on the canvas for rectangle, polygon, brush and eraser; keep the numeric form as an accessible fallback behind a disclosure.
3. Canvas-first layout: pan/zoom by gesture and wheel, inspector docks below in portrait, tool rail left.
4. Retire the duplicate review components once parity tests pass.

### Phase 2 — UX and copy pass

1. Copy audit: replace engineering terms with task language, move "not connected yet" notes to docs, hide IDs.
2. Shared number/unit formatting through `Intl.NumberFormat` with unit-appropriate precision (m², cm², ft²) and locale-aware decimals.
3. Restructure estimate review as summary + steps (Scope → Phases → Extras → Adjustments & tax → Issue).
4. One app shell: sidebar in landscape, compact header + drawer in portrait/phone; real breadcrumbs.
5. Styled file picker, select and button hierarchy (one primary per view).

### Phase 3 — Code structure

1. Add Vitest for `src/platform/**` with test vectors for estimates, geometry, vault crypto and revision queue; run it in CI.
2. Introduce one router module (typed routes, guards, deep links) and an app context replacing the prop-drilled `model`.
3. Central i18n catalogue with typed keys and a missing-translation check.
4. Rename `src/ui/account-access/` into feature folders (`account/`, `projects/`, `estimates/`, `reports/`, `sharing/`).
5. Split Go `internal/identity` into domain packages without behaviour changes; keep tests green at each step.
6. Replace hard-coded colours with tokens; remove file-level lint disables.

### Phase 4 — Delivery hygiene

1. Merge the two CI workflows into one with parallel jobs (frontend checks, Go tests, platform E2E).
2. Consolidate `docs/m*.md` under `docs/milestones/` and add a one-page architecture overview with ADRs for future decisions.
