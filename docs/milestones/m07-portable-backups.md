# M-07 · Portable project backups

Open a project and choose **Export encrypted backup**, then **Prepare backup**.
Save the generated key separately and download the `.crproject` file. In an
unlocked destination vault, open **Import encrypted backup** from **All
projects**, select the archive, and enter the backup key. The project opens as
a new local copy. After the app is open, export and restore can run offline.

## Archive and restore boundaries

- Version 2 includes the saved project document, estimate draft and all issued
  snapshots, report draft and every original referenced
  by its surfaces. Multiple references share one archived original. Original
  manifests retain the filename, MIME type and size. Original bytes retain
  embedded metadata. Missing or damaged local originals stop export.
- Restore assigns new project and original IDs and starts at local revision 1.
  Hosting, invitations, remote revision keys, sync state, conflict records,
  invitation-only offline pins, and personal libraries remain outside the
  portable copy. Committed assessments and checkpoints embedded in the project
  travel with it; separate unfinished drawing journals remain device-local.
  Estimate inputs and quantities bind to the new project ID; estimate photo
  bindings and report reference selections bind to restored originals. Issued
  snapshot IDs, versions, dates, results and source revision provenance remain
  intact. Report settings, selected estimate ID, saved date and source project
  revision remain intact. Source revisions are not relabelled as revision 1;
  existing freshness checks can therefore request review in the new copy.
- The binary header contains the eight-byte magic/version `CRPROJ02`, a
  random 32-byte salt and a four-byte big-endian encrypted index size. A
  randomly generated 256-bit backup key, displayed as 64 hexadecimal
  characters, feeds HKDF-SHA-256 with the archive salt and magic/version as
  context. AES-256-GCM authenticates the header as associated data for every
  frame. The zero-based frame number occupies the last four bytes of the
  12-byte nonce. Each frame has a 16-byte tag. The first frame holds the
  project, ordered document shapes (kind and encrypted byte length) and ordered
  original shapes. Each present estimate/report record contributes one UTF-8
  JSON frame immediately after the index, in index order. Each original contributes its
  manifest and fixed-size data parts using the existing file layout. The index
  determines all part sizes and the exact archive length.
- Import still accepts `CRPROJ01` with its original HKDF context and layout;
  those archives restore without estimate/report records. New exports always
  use version 2, including when neither record exists. Version 2 requires an
  explicit document list; duplicate/unknown kinds, invalid lengths and unknown
  archive versions are rejected. Older app versions cannot open v2 archives.
- The index is capped at 1 MiB and the archive at 512 MiB. The existing 256 MiB
  per-original cap applies. Export accumulates archive ciphertext for download.
  Import authenticates one frame at a time, encrypts it for the destination
  vault and holds the resulting ciphertext until commit. One strict-durability
  IndexedDB transaction checks the current vault stamp and inserts the project,
  estimate, report, file headers and file parts together. Estimate and report
  frames retain the vault's respective 768 Ki and 64 Ki character limits;
  declared UTF-8 frame sizes are bounded before reading. An abort before commit rolls back every
  row. A completed commit yields the full local copy.
- Device memory limits near the archive cap, physical Safari/iPad behavior and
  independent cryptographic review remain qualification gates.

## Verification

`npm run test:files` covers the download and restore controls in Chromium with
synthetic identity responses, separate browser contexts and the destination
offline during import. Browser storage tests cover a fresh vault with a
different vault key after deleting the source vault, byte-for-byte multi-part
original recovery after lock and unlock, preserved roles and metadata,
deduplication, missing originals, wrong keys, corrupt final frames, truncated
and extended archives, cancellation during decryption and an injected
transaction abort after file writes begin. The failed attempts leave zero
project or original rows, and retry restores the full copy.

The #55 backup slice adds unit coverage for v1 compatibility, v2 projects with
neither/either/both records, reference remapping, preserved issued results and
revision provenance, invalid document indexes, record tampering, size limits
and atomic rollback. The multi-part browser round-trip now includes an issued
estimate and configured report, deletes the source vault and reopens both
through their repositories after locking/unlocking the destination. Wrong-key,
corrupt, truncated, extended, cancelled and transaction-aborted restores leave
zero project, estimate, report or original rows. Recipient report authoring
followed in its own slice ([ADR 0008](../adr/0008-recipient-own-reports.md),
[M-10](m10-reports-and-exports.md#2026-11-17-owner-decision-recipient-reports-55)):
recipient drafts live in the recipient's own vault table and are deliberately
not part of the owner's backups.

Verification for this slice: `npm run check`, `npm run test:unit` (278 passed),
`npm run test:files` (44 Chromium tests passed), `npm run build-storybook` and
the built Storybook browser suite (18 passed). Landscape and portrait backup
screenshots were inspected. Physical Safari/iPad and maximum-size memory
profiling were not run.

Original M-07 verification: the file suite passed all six tests with one worker. The Storybook browser
suite passed all 11 tests with one worker. `npm run check` and
`npm run build-storybook` also passed. The backup browser test captures and
checks the landscape export and portrait import screens with axe.

Format references: [HKDF (RFC 5869)](https://www.rfc-editor.org/rfc/rfc5869.html)
and [AES-GCM (NIST SP 800-38D)](https://csrc.nist.gov/pubs/sp/800/38/d/final).
