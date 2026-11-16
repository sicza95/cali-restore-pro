# Photo removal with drafts

16 November 2026 · Status: done · Issue: #67 · Found while fixing [the recovery conflict](recovery-conflict.md) (#63)

Goal: removing a detail photo that the assessment uses, with drawing drafts pending, keeps the drafts editable on this device, from the surface page and from the project page.

## Where things stand

On `main` at `11ae4a2`, `updateSurfaceImages` (`src/platform/projects/surface-attachments.ts`) drops a removed photo from each assessment's `details` and `alignments`, and both pages save the result without the surface journal. The journal's head (a SHA-256 of the assessment's JSON) then no longer matches: `currentJournal` reports a conflict in the session, and `openJournal` does on reopening. The surface page pauses editing with "Editing paused. The assessment changed outside this editor…", and "Discard draft" is the only way on.

Photo setup and checkpoint restores already carry the journal: `recovery.save` writes it with the new head in the same transaction as the project (`projectDocuments().save(…, journal)`).

## Soundness

Carrying the journal forward is sound for this change, with history pruned:

- **Drafts.** A draft is a layer index and marks in the main photo's coordinates. Marks drawn through an aligned detail are mapped to those coordinates on input (`DrawingCanvas`, `toCanonical`), and they lie inside the main photo's crop, which is the drawing region on the main photo. Removing a detail changes neither the drawing layers, nor the main photo, nor its crop, so every draft stays valid and editable on the main photo, as committed marks drawn through the detail already do today.
- **The draft source.** Removing the photo the drafts belong to drops the whole assessment. The surface page already blocks it (`pendingSource`). Nothing is carried for a dropped assessment.
- **History.** `photoChange` entries hold whole `details` and `alignments` lists, and `checkpointChange` entries hold whole assessments. Undoing one after the removal would bring the removed photo back into the assessment; the save would then fail validation ("Assessment photo is not attached"). Undo of these entries is allowed with drafts pending, so it is reachable. The carried journal therefore drops the removed photos from both sides of those entries, and drops entries that become no-ops. Drawing entries hold layer rows only and stay as they are.
- **An existing conflict stays one.** The journal is carried only when its stored head matches the assessment before the removal. A journal written against other content (another device's revision, an older journal) is left as it is, so the page still pauses for it.
- **Project page.** It does not load the journal. A shared platform function reads the journal of each assessment the removal changes, carries it and returns the writes; the page saves them with the project in one transaction, which fails as a whole if a journal changed meanwhile.
- **Surface page, same session.** The same function runs there; the open journal is then replaced by the written one (new revision and head), so the next save expects the right revision.

Not covered, and out of this issue: the project page does not block removing the draft source photo (the surface page does). The assessment and its drafts' context are dropped; no pause appears, and the drafts stay unreachable in storage. Recorded as #72, since fixed ([plan](draft-source.md)).

## Approach

1. **Platform.** In `surface-journal.ts`, `carryJournal(text, before, after, retained)` returns the stored journal with the new head and pruned history, or nothing when the stored head does not match `before` or the head does not change; `openJournal`'s validation becomes `parseJournal`. In `surface-attachments.ts`, `changeSurfaceImages(readJournal, ref, surface, images)` returns `updateSurfaceImages`' changes and the carried journals (write and journal) for the assessments that changed. Untouched assessments (attach, role change) read nothing.
2. **Store.** `projectDocuments().save` and the save chain above it accept several journal writes, written in the project's transaction.
3. **Pages.** The project page and the surface page save photo changes through `changeSurfaceImages`. `createSurfaceJournal` gains `carried(source, revision, journal)`, which the surface page calls after the save.

## Verification

- Vitest: `carryJournal` (carried with the new head; not carried for another head or an unchanged head; history pruned, no-op entries dropped, drawing entries kept) and `changeSurfaceImages` (no reads for an attach; writes for each changed assessment with a matching journal; none without a journal or for a dropped assessment). Each is run against the old code to see it fail.
- Browser (`tests-platform/surface-journal.browser.ts`): a save with two journal writes writes both, and rolls back as a whole when one is stale.
- Browser, in the projects flow through a helper (`projects.browser.ts` is at 397 lines): with a pending mark, removing an aligned detail photo on the surface page, then another on the project page, keeps editing available: no recovery notice, tools enabled, the pending mark kept, also after a reload. Each check is run against the old code to see it fail.
- The #38 warning checks need another real conflict. The test writes the project through the app's own storage layer in the page, as another device's revision lands when a blocked sync draft is resolved with the cloud copy (`project.sync.keep-cloud`: `resolveEditor` replaces the local project row and leaves the journal): the main photo's crop changes and the revision goes up. The surface's drafts were journalled against the old assessment on this device, so after a reload `openJournal` reports the conflict. `verifyRecoveryWarning` then runs unchanged, and "Discard draft" resumes editing.
- `npm run check`, `test:unit`, `npm test`, `test:files` (the projects flow also with `--repeat-each 5`), `test:sync`, `build-storybook`.

## Outcome

- As planned: `carryJournal` and `parseJournal` in `surface-journal.ts`, `changeSurfaceImages` in `surface-attachments.ts`, a list of journal writes in `projectDocuments().save` and the save chain, and both pages saving photo changes through `changeSurfaceImages`; the surface page hands the written journal to `createSurfaceJournal.carried`.
- Nothing had to be blocked or left pausing for a detail removal. A journal already written against other content is not carried and still pauses; removing the draft source on the project page is #72.
- The projects flow's `verifyRemovalKeepsDrafts` (in `recovery-conflict.ts`; `projects.browser.ts` is at 398 lines with a namespace import) attaches and aligns `side-detail.png` with manual guide points, removes it on the surface page and then `wall-detail.png` on the project page. With the old surface page it fails at its first check after the surface-page removal (brush disabled); with the old project page, at the first check after the project-page removal; without the journal write, at the reopen check; without `carried`, at the in-session check. The Vitest cases fail on the old code (the functions do not exist) and on mutants without the head guard or the history pruning; the store's multi-journal check fails with the old store.
- `verifyRecoveryConflict` writes the other device's revision in the page and reopens the surface; `verifyRecoveryWarning` runs unchanged on that conflict.
