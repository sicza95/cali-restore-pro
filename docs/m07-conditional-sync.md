# M-07: conditional sync foundation

The owner-only revision API stores one ciphertext head per hosted project.
Writes compare both the expected head revision (zero for a new head) and the
current sync epoch under the same project lock as owner revocation. An identical
retry can acknowledge the current head after a lost response. A stale write
cannot replace a newer head. The host's storage quota includes the revision.

Owner removal advances the sync epoch. Revoking an active invitation also
advances it conservatively. Publication waits while original grants need
rotation. The old head retains its original epoch for authorized recovery.
Only current project owners can read or write heads. A revoked device may
still retain data it had already downloaded.

The unlocked vault exposes a durable, account-scoped retry queue. It holds
one candidate per project, with a sealed local recovery copy. Transient
failures retry with backoff or on reconnect when the runner is active.
Locking the vault stops the runner, and forgetting the vault removes drafts.
Conflicts and access or epoch failures stop automatic publication and preserve
the local draft. To recover, fetch and decrypt the current head, review it
alongside the local draft, and stage the chosen result against the reviewed
revision. A new epoch requires a fresh project key; the API cannot inspect
ciphertext or verify client key distribution.

The project editor saves locally first. On a hosted project with no cloud head,
the owner can enable editor sync while connected. The unlocked project workspace
queues changed documents against the last acknowledged cloud revision. Edits made
while a candidate is pending remain in the encrypted local project and are
staged after acknowledgement. The queue and checkpoint update together, so a
reload does not silently rebase an offline edit onto a newer head. Reopening the
workspace and unlocking the vault resumes pending work once the app can establish
the account session.

The vault generates an independent random key for each project and epoch and
seals it under the account's local vault key. It retains earlier epoch keys for
review and removes them when the vault is forgotten. During conflict recovery
the editor compares the latest local copy with the decrypted cloud copy. An owner
can publish the local copy or adopt the cloud copy; either selection is staged
against the reviewed revision. If the server has advanced to another epoch, the
editor reads the old head with its old key and provisions a fresh key for the
new epoch. It stops if an existing head cannot be decrypted. Offline original pins, portable project backups and lifecycle and
retention enforcement remain separate M-07 work.

An owner with a readable cloud head can share its epoch key from **Cloud sync**.
Enter the receiving owner's account ID (shown under **Open a synced project
on this device**) and pass the transfer code privately to that device. The
code contains a random 256-bit secret that stays off the server. The existing
vault envelope uses HKDF-SHA-256 and AES-GCM, with the recipient account,
project, transfer ID, head epoch and current authorization epoch bound into
the authenticated context. The receiver verifies the key by opening the cloud
head before saving it in the unlocked vault. A new local copy and its sync
checkpoint are saved together; receiving a key for an existing copy leaves
its local edits and checkpoint intact.

The server holds one encrypted transfer per recipient and project. A new code
replaces the old one; a code can be retried for 15 minutes by its intended
authenticated owner. Both parties must still be active project owners and a
change to either epoch invalidates pending transfers. Only an owner who can
decrypt the published head can create a usable transfer; if two owners race to
publish a new epoch, the losing owner can receive the winning key and review
their draft again. Anyone with the intended owner's session and the private
code can redeem it, so the code must be shared over a trusted channel. Revoking
a session blocks requests from that session; removing a project owner also
rotates the project epoch. Neither can recall keys or content already obtained.
A paired device needs a new code when it does not have the new epoch key.
Expired records are inaccessible and can be replaced; physical expiry and
restore-safe revocation remain lifecycle work.

Verify the browser queue and editor recovery with `npm run test:sync`. The
editor test uses two isolated browser vaults with simulated revision and key
transfer endpoints. The Go integration test exercises real PostgreSQL access
checks, transfer expiry and epoch invalidation, conditional writes, replay,
quota accounting and owner revocation with TEST_DATABASE_URL set.
