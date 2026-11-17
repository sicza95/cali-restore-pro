# Drawing notice follows the app language

16 November 2026 · Status: done · Issue: #83 · Found in the screenshots of [the visible reason for blocked originals](visible-reason.md) (#79)

Goal: the drawing workspace's status notice ("Preview updated · Damage layer") follows a language change while it is shown, so the app in HU reads "Előnézet frissítve · Kárréteg".

## Where things stood

On `main` at `0c2a228`, the notice in `DrawingWorkspace.tsx` was a plain string returned from a `<Show>` function child. Solid runs that child untracked, so the string was computed once when the notice appeared and kept its language, notice kind and layer name. Both strings already had HU in `drawing-review/copy.ts`; the layer has no stored name.

## Approach

The `<Show>` child returns JSX with the copy and the layer name inside, so each stays reactive. No copy changed.

## Outcome

- As planned. `tests-platform/drawing-notice.ts` switches EN, HU and back to EN with the "changed" notice shown after the pen stroke in `verifyDrawingInput` (step 2 of the projects flow, "originals attach, drawing review and checkpoints") and expects each language's text. It failed on the old code with "Preview updated · Damage layer" in HU.
- Verified: `check`, `test:unit` 239, `npm test` 18, `test:files` 32, `build-storybook`, the projects flow with `--repeat-each 5` before the #44 split, and once after it (9 passed). Not run: `test:app`, `test:sync`, `test:estimates`.
