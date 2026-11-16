# Recovery conflict

16 November 2026 · Status: in progress · Issue: #63 · Found while doing [the warning treatment](warning-treatment.md) (#38)

Goal: the surface page pauses editing only when the assessment really changed under unsaved drawing drafts, not when an unchanged assessment arrives as a new object.

## Where things stand

On `main` at `a49d35a`, attaching a photo to a surface with drawing drafts pending shows "Editing paused. The assessment changed outside this editor…" and disables the drawing tools, although the assessment did not change. Two pieces combine:

- `updateSurfaceImages` (`src/platform/projects/surface-attachments.ts`) maps every assessment to `{ ...entry, details: filter, alignments: filter }`, so each one is a new object even when no photo was removed.
- `createSurfaceJournal.journal()` (`src/ui/projects/createSurfaceJournal.ts`) keeps the assessment it loaded the journal against and treats any other object as a change (`current.assessment === options.assessment()`), so the copy counts as a conflict.

After a reload, `openJournal` compares the journal's head (a SHA-256 of the assessment's JSON) with the current assessment's, finds them equal and returns the drafts. The in-session check and the reopen check disagree.

Other ways the same content arrives as a new object: changing a photo's role on the surface page or the project page (both go through `updateSurfaceImages`), and the project list's "Refresh" after a failure, which parses every project again (`localProjects().list()`). Project saves keep nested objects (`localProjects().save` validates and spreads the same tree), and drawing, photo setup and checkpoint restores go through the journal, which records the new assessment.

## Approach

Both fixes the issue names, because they cover different things.

1. **Compare content in the in-session check (the fix).** A pure `currentJournal(journal, loaded, current)` in `surface-journal.ts` returns the journal when the two assessments are the same object or have the same head text (the JSON `journalHead` hashes, `''` without a revision), and the conflict journal otherwise. `createSurfaceJournal` calls it from a memo, so the JSON is built only when the objects differ, and only once per change. This makes the in-session rule the same as the reopen rule for every caller, including role changes and the refresh.
2. **Keep untouched assessments in `updateSurfaceImages`.** An assessment whose source, details and alignments are all still attached is returned as the same object. It saves the copy and the JSON comparison on the common path (attaching or re-roling a photo), and the editors downstream see no new state. Removing a photo still filters as before.

## Verification

- Vitest: `src/platform/projects/surface-journal.test.ts` for `currentJournal` (same object, same content as a copy, changed content, no drafts, no revision) and `src/platform/projects/surface-attachments.test.ts` for `updateSurfaceImages` (kept by identity on attach and role change, filtered on removal). Each is run against the old code to see it fail.
- Browser, in the projects flow through a helper (`tests-platform/recovery-conflict.ts`, since `projects.browser.ts` is at 399 lines): after the reference photo is attached with drafts pending, no recovery notice, the drawing tools enabled on the main photo and both layers' drafts kept. The page-wide axe check that ran at that point stays there.
- The #38 warning checks need a real conflict. Later in the same flow: draw a pending mark, open the project page and remove the detail photo `wall-detail.png`, which is aligned in the assessment. The project page saves the surface without its journal, so the drafts on this device were written against an assessment that no longer exists: the same state another device's revision produces, and what `openJournal` reports on reopening. Back on the surface, `verifyRecoveryWarning` runs unchanged, then "Discard draft" resumes editing.
- `npm run check`, `test:unit`, `npm test`, `test:files` (the projects flow also with `--repeat-each 5`), `test:sync`, `build-storybook`.
