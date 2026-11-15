# M-07 · Portable project backups

Open a project and choose **Export encrypted backup**, then **Prepare backup**.
Save the generated key separately and download the `.crproject` file. In an
unlocked destination vault, open **Import encrypted backup** from **All
projects**, select the archive, and enter the backup key. The project opens as
a new local copy. After the app is open, export and restore can run offline.

## Archive and restore boundaries

- Version 1 includes the saved project document and every original referenced
  by its surfaces. Multiple references share one archived original. Original
  manifests retain the filename, MIME type and size. Original bytes retain
  embedded metadata. Missing or damaged local originals stop export.
- Restore assigns new project and original IDs and starts at local revision 1.
  Hosting, invitations, remote revision keys, sync state, conflict records,
  invitation-only offline pins, and personal libraries remain outside the
  portable copy. Future authored editor data, historical project checkpoints
  and estimate data still need coverage as their storage models land.
- The binary header contains the eight-byte magic/version `CRPROJ01`, a
  random 32-byte salt and a four-byte big-endian encrypted index size. A
  randomly generated 256-bit backup key, displayed as 64 hexadecimal
  characters, feeds HKDF-SHA-256 with the archive salt and magic/version as
  context. AES-256-GCM authenticates the header as associated data for every
  frame. The zero-based frame number occupies the last four bytes of the
  12-byte nonce. Each frame has a 16-byte tag. The first frame holds the
  project and the ordered original shapes. Each original then contributes its
  manifest and fixed-size data parts using the existing file layout. The index
  determines all part sizes and the exact archive length.
- The index is capped at 1 MiB and the archive at 512 MiB. The existing 256 MiB
  per-original cap applies. Export accumulates archive ciphertext for download.
  Import authenticates one frame at a time, encrypts it for the destination
  vault and holds the resulting ciphertext until commit. One strict-durability
  IndexedDB transaction checks the current vault stamp and inserts the project,
  file headers and file parts together. An abort before commit rolls back every
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

The file suite passed all six tests with one worker. The Storybook browser
suite passed all 11 tests with one worker. `npm run check` and
`npm run build-storybook` also passed. The backup browser test captures and
checks the landscape export and portrait import screens with axe.

Format references: [HKDF (RFC 5869)](https://www.rfc-editor.org/rfc/rfc5869.html)
and [AES-GCM (NIST SP 800-38D)](https://csrc.nist.gov/pubs/sp/800/38/d/final).
