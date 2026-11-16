# Warning treatment

16 November 2026 · Status: done · Issue: #38 · Source: [quality baseline re-check](../reviews/2026-11-14-quality-baseline.md#re-check-on-current-main), new finding 3

Goal: when a surface's unsaved drawing no longer matches its assessment, the page says so as a warning the user sees on the first screen, with the discard action beside it. iPad and desktop only ([ADR 0003](../adr/0003-ipad-and-desktop-only.md)).

## Where things stand

On `main` at `bc3f147` the message sits in `SurfaceWorkspace.tsx`, after the photo setup panel and before the drawing and checkpoint panels, so it shows in every mode. The pan buttons the finding mentions are gone (#34); in photo setup the message now follows the canvas, the view row and the gesture hint. It is a bare `<p role="alert">` with "Discard draft" on its own row below it, in body text with no colour or rule. At 1194 × 834 it starts about 960 px down the page, below the fold, while photo setup, drawing and checkpoints are all paused until the user acts on it.

The same slot shows the reopen failure ("Your unsaved drawing could not be reopened." with "Try again"). The drawing editor's save status already reads "error" in both cases; no other screen shows this message.

Existing patterns: the `--cr-warning` token exists in both themes (the connection dot and the cleaning swatch use it), and `.account-message` in `account-access/styles.css` is the app's message box: surface background, padding and a 3 px rule in a semantic token, `data-error` turning it to `--cr-negative`. There is no warning variant and no warning component.

## Approach

1. **One notice component.** `SurfaceRecoveryNotice` (in `src/ui/projects/`) takes the failed and conflict states and renders the existing `.account-message` box with a new `data-warning` variant that sets the rule to `--cr-warning`. The failure keeps `data-error` (`--cr-negative`). The `alert` icon from the one icon family sits before the text, in the same token, hidden from assistive technology; the text carries the meaning.
2. **Placement.** The notice moves above the photo picker row, under the mode tabs, so it is on the first screen in photo setup, drawing and checkpoints at both iPad sizes. The message and its button share one row: the text takes the space, the button sits at the row's end and wraps below only when there is no room.
3. **Role.** The conflict is `role="status"` on the message, not `alert`. It is not time-sensitive: nothing is lost while it waits, the drafts stay on the device, and it often appears right after the user's own action (attaching a photo), whose status an assertive alert would cut off. The reopen failure stays `role="alert"`: an operation failed and "Try again" is the response. The button is described by the message (`aria-describedby`), so focusing it says why.
4. **Copy.** A short lead, "Editing paused" / "A szerkesztés szünetel", in the drawing copy, following "Sync paused" / "Szinkronizálás szünetel". The existing message and button strings stay; they already follow the glossary ("draft", _vázlat_).
5. **Touch and focus.** The button keeps the shell's 44 px minimum and the global `:focus-visible` outline.

## Verification

- A new helper, `tests-platform/recovery-warning.ts`, called from `projects.browser.ts` where the flow already shows the message (after the reference photo is attached while drafts are pending). It checks the status role, the warning rule colour against the token, that the notice is above the canvas and on the first screen, that the button is in the same row, 44 px, focused by Tab with a visible outline, and runs axe on the notice in light and dark at 1194 × 834 and 834 × 1194, in EN and HU, saving `recovery-<lang>-<theme>-<width>.png`. The page-wide axe check that `projects.browser.ts` ran at that point moves into the helper unchanged (the file is at the 400-line limit).
- `npm run check`, `test:unit`, `npm test`, `test:files`, `build-storybook`.

## Outcome

- As planned: `SurfaceRecoveryNotice` renders `.account-message` with the new `data-warning` rule (`--cr-warning`), the `alert` icon, the lead "Editing paused." / "A szerkesztés szünetel." and "Discard draft" in the same row, under the mode tabs. At 1194 × 834 and 834 × 1194 it is on the first screen above the photo picker; the Hungarian text wraps to two lines at 834 with the button still beside it. The reopen failure uses the same box with the error rule and keeps `role="alert"`.
- The conflict message is `role="status"`; the button is described by it.
- `tests-platform/recovery-warning.ts` runs where `projects.browser.ts` already reaches the conflict. On `main` it fails at its first check (no `.surface-recovery`); with the change it passes. The page-wide axe check that ran at that point is now the helper's first step.
- The flow reaches the conflict through a false positive: attaching a photo rebuilds the assessment objects, and the in-session journal compares them by identity. Recorded as #63; fixing it needs another way to reach a real conflict in this test.
