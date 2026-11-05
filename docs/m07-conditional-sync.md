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
new epoch. It stops if an existing head cannot be decrypted. Revision key
distribution to other owner vaults and recovery on a new browser are not yet
supported. Offline original pins, portable project backups and lifecycle and
retention enforcement remain separate M-07 work.

Verify the browser queue and editor recovery with `npm run test:sync`. The
editor test drives the app against a simulated revision endpoint. The Go integration
test exercises real PostgreSQL authorization, conditional writes, replay, quota
accounting paths and owner revocation with TEST_DATABASE_URL set.
