# M-05: projects, objects and surfaces

M-05 starts at [merged PR #9](https://github.com/sicza95/cali-restore-pro/pull/9)
(`4ae86c3` on `feat/storybook-foundations`). Sign in and open **Projects**, then
set up or unlock the local vault. Create a project with a default object and
surface. The register sorts recent edits first, searches by name, and separates
active and archived projects. Project links retain the same ID after a rename.
A project opens one surface at a time.

Project documents and settings have independent version fields. Each save
increments the project revision. The local store compares the expected revision
and vault stamp inside the IndexedDB write transaction, so a stale edit fails
without replacing the saved copy. The existing vault cipher authenticates the
account, opaque project ID and revision as the project context. Names, settings,
archive state, hierarchy and file references are ciphertext at rest. The local
store can see the account, opaque project IDs, revisions and ciphertext sizes.
The current envelope allows 64 KiB of serialized text per project document.

Project units apply to objects and surfaces unless overridden. Currency is saved
as a three-letter code. Attachments reference the M-04 encrypted original bytes
and carry a mapping or reference-only role. File name, MIME type and length come
from the original's authenticated manifest after unlock. Attaching stages the
file before committing its reference; removal commits the reference change first.
A browser shutdown between those two writes can leave unreferenced encrypted
bytes. Vault forget removes documents and originals in the same transaction.

Project documents stay in this browser. M-04 hosting remains an explicit,
quota-checked file service. The project screen does not send project metadata
or originals to it. Account and administrator deletion preflights now detect
existing hosted projects, while deletion still fails closed until continuity can
be established. The earlier vault snapshot and device approval workflows cover
only the sample snapshot. Project backup, import, recovery and sync are future
work, as are image decoding and measurement.

## Verification

- Chromium exercised real IndexedDB and Web Crypto with synthetic data and a stubbed
  sign-in response. The walkthrough covered hierarchy, inherited units, encrypted
  original metadata and roles, reopening by URL after reload, and archive filtering.
  The storage test checked revision conflicts, lock invalidation and vault forget.
- Axe found no violations in the populated project view. Both iPad viewport
  screenshots were inspected:
  [1194 × 834 landscape](evidence/m05/projects-landscape.png) and
  [834 × 1194 portrait](evidence/m05/projects-portrait.png).
- Go vet and race tests against disposable PostgreSQL covered hosted and unhosted
  deletion preflights and the encrypted file regressions. TypeScript, ESLint,
  Prettier, the production app build, and OpenAPI generation passed. The Storybook
  build and all 11 browser tests passed using the built preview.
- Physical iPad/Safari, project backup and synchronization were not qualified.
