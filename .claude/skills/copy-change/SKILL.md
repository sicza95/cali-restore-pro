---
name: copy-change
description: How to change user-facing wording in CaliRestore Pro (EN and HU) without breaking tests — the glossary to follow, the searches to run before editing, and which suites and screenshots to check. Use for any copy audit commit or other string change in copy files.
---

# Changing copy

Living skill: edit it when the process changes, and note why in `docs/handoff/process-notes.md`.

1. **Words**: follow [`docs/copy-glossary.md`](../../../docs/copy-glossary.md). Change EN and HU together; a new idea that isn't in the glossary goes in it first.
2. **Before editing**, list every old string you will change, in EN **and** HU, and search `tests` and `tests-platform` for each one. Tests look up Hungarian headings too.
3. **Lookups**: prefer `data-control-id`. A `getByRole(…, { name })` or `getByText` matches substrings, so a shorter new name can match two elements: add `exact: true`.
4. **Check the claim**: before rewording a status note, check that it is still true in code (one estimate note was false; the backup note was true but in the wrong place, and its error path was wrong).
5. **Keys**: control ids never change. Rename a copy key only when its name misleads; `npm run typecheck` finds the readers.
6. **File limit**: the 400-line ESLint limit counts; move a helper out rather than squeezing.
7. **Verify**: `npm run check`, `npm run test:files`, then look at the affected screenshots in EN and one HU, **before** `npm test` (it deletes `test-results/`). Then `npm test` and `npm run build-storybook`. Run `npm run test:estimates` when estimate copy changed.
