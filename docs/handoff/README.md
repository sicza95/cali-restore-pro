# Handoff

Shared by Codex and Claude. Update at the end of every working session. Newest entry first; keep the "Current state" block accurate and trim the log to the last ~10 entries (older detail lives in git history and milestone docs).

## Current state

- **Branch:** `main`, pushing directly per `AGENTS.md`.
- **Last milestone:** M-16 measured estimates and draft outputs ([evidence](../m16-measured-integration.md)), followed by `3c33d33` workspace/shell refresh and dev launcher.
- **Quality baseline:** [2026-11-14 review](../reviews/2026-11-14-quality-baseline.md) — code 7, architecture 7, UX 4, UI 5.
- **Active roadmap phase:** Phase 0 (working agreement) → next Phase 1 (converge the Storybook editor into the app).
- **Known gaps:** app screenshots used in the review predate `3c33d33`; Go tests, Compose stack and Playwright were not run in the review session.

## Next step

Re-run the Playwright suites on the current `main` (`npm run test`, `npm run test:app`) so the review's app-screen findings can be confirmed or retired, then start Phase 1, step 1: wire `EditorWorkspace` to the real surface/layer/mask store behind the existing drawing-review route.

## Open questions for the owner

1. Phase 1 replaces the form-driven drawing review with canvas drawing. Keep the numeric point form as an accessible fallback, or drop it?
2. Is the 390 px phone layout a supported target, or only iPad and desktop?
3. Should Claude and Codex keep pushing straight to `main`, or move to short-lived branches with PRs while the editor convergence lands?

## Log

### 2026-11-14 · Claude · Onboarding and quality baseline

- Discovered the repo, plan pack, milestone docs and recent history.
- `tsc --noEmit` and `eslint` pass (Node 22 VM). Storybook rendered at iPad landscape and portrait; app screens reviewed from the 16:11 Playwright run.
- Added `CLAUDE.md`, this handoff and `docs/reviews/2026-11-14-quality-baseline.md`; linked the handoff from `AGENTS.md`.
- Not done: no code changes; nothing committed by Claude (signing key is on the owner's machine).
