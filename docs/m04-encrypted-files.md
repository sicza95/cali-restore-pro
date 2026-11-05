M-04: encrypted originals
=========================

M-04 builds on [merged PR #8](https://github.com/sicza95/cali-restore-pro/pull/8) at
`9d93b8a` on `feat/storybook-foundations`. It adds the file service and unlocked browser vault
operations that M-05 will call. Project navigation, attachment roles and image decoding remain
outside this milestone. Tests use synthetic byte sequences; they do not qualify any image format
or physical iPad workload.

### File format and local durability

- Source bytes are read in 1 MiB slices and preserved as supplied. The envelope accepts 1 byte
  through 256 MiB. Part 0 is a manifest, at most 16 KiB including its tag. Its authenticated UTF-8
  JSON contains `{v:1,name,type,size}`; the MIME type is the browser's supplied value. Parts 1
  through 256 contain original bytes. Each part has a 16-byte AES-GCM tag.
- The file key is HKDF-SHA-256 from the unlocked vault root, with the UTF-8 file UUID as salt and
  the UTF-8 JSON array `["calirestore-original",1,account,project,file]` as info. AES-256-GCM uses
  the same array with the part number appended as associated data. Its 12-byte IV is eight zero
  bytes followed by the unsigned 32-bit big-endian part number. The client generates a fresh
  random UUID for each new original; retries reuse the stored ciphertext. Never encrypt
  different bytes under an existing file reference.
- IndexedDB stores the ciphertext under the account and file ID in strict-durability
  transactions. The ready marker is committed only after every part is durable. Vault lock
  invalidates active file handles; forget deletes the account's local files in the same
  transaction as the vault. A cancelled local stage is removed; incomplete stages older than
  24 hours are swept at the next staging operation. Browser storage limits and eviction still
  apply. M-03 snapshot exports contain only the vault snapshot; file backup and portable key
  continuity need their own workflows.
- Local reads authenticate each part before returning its bytes. Remote retrieval authenticates
  all parts before marking the local copy ready. An original read is a stream: an error in a
  later part may follow a valid prefix, so consumers must handle failure before publishing
  any exported copy.

### Hosting and transfer

The [OpenAPI contract](../contracts/openapi.json) defines owner-only hosted project creation,
reservation, part upload, commit, retrieval, and cancellation. No platform role grants access to
another account's files. Hosting is explicit and requires an active account with the broader
feature entitlement and a positive quota. Each file is a new immutable resource with a
client-generated operation ID; there is no replace/update revision in M-04. IDs are supplied
by the caller. M-05 owns the project document and file references.

Reservations and committed files count their ciphertext bytes once against the owner:
source length + 16 bytes per source part + encrypted manifest length. Account row locks serialize
reservations and entitlement/quota changes. Each request checks the live session and ownership.
Withdrawing hosting or reducing quota below accounted bytes blocks growth and publication;
authorized reads and staged cancellation remain available. Cancelled and expired bytes remain
charged until cleanup removes them. Hosted account deletion still fails closed through the
existing continuity preflight.

Part uploads require the expected length and a matching SHA-256 of ciphertext. Retry replays
the same parts; the server accepts identical ciphertext and can repair a damaged staged object
with those identical bytes. A checksum is a storage integrity check; the browser's AEAD
verification supplies authenticity. Bytes live in a private `encrypted-v1` directory on the
shared object volume. The server syncs and atomically renames each object before recording its
digest; commit checks every part's presence, size and digest before making the file readable.
Missing or corrupt committed parts fail closed. Cancellation is durable, and the worker claims
one cancelled or expired staging record per tick with a row lock. A crash before metadata
commit leaves bytes discoverable through the existing reservation. An upload abandoned for 24
hours can be reserved again after cleanup; the local ciphertext stays available for retry.
Network interruption can abort the current attempt; explicit remote cancellation releases the
reservation after cleanup. There are four concurrent transfer requests per app process.

The server sees account ownership, opaque project/file IDs, source and ciphertext lengths, part
indices, ciphertext hashes, reservation state and expiry. It receives no filename, MIME type,
plaintext digest, image metadata or usable content keys. M-00 substrate backups refuse
databases with hosted projects. Hosted recovery still needs a committed-object backup inventory,
independent revocation/deletion records and retention enforcement in M-07.

### Verification

- Go formatting, vet and race suite against disposable PostgreSQL, including concurrent quota
  claims, cross-account isolation, retries, incomplete/corrupt/missing parts, hosting withdrawal,
  session revocation, cancellation and expiry cleanup.
- Chromium test of real IndexedDB, including cancellation, reload, byte-for-byte recovery,
  encrypted metadata, lock, chunk swap/tamper detection and atomic vault forget.
- The disposable Compose smoke transfers and decrypts a synthetic 64 MiB source across an
  app/worker restart using the browser file format. The loopback run measured 28.8 MiB/s
  upload, 31.7 MiB/s download, 38.9 ms p95 part round-trip time and 107.6 MiB peak RSS in
  the Node smoke process. It used sequential transfers and fresh connections; WAN latency,
  sustained concurrent capacity, database pool pressure, iPad memory and decoding remain
  qualification work.
- The isolated substrate backup/restore smoke verified schema and object bytes, checksum
  rejection and existing-volume refusal. The encrypted-file smoke checked that the
  substrate guard refuses a database with hosted project records.
- TypeScript, ESLint, Prettier, production frontend build and generated OpenAPI types passed.
  The five existing Chromium vault regression tests also passed against the deployed app.
