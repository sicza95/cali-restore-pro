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

This foundation takes an independently provisioned project key for each epoch.
The existing editor continues saving locally until key provisioning and sync
controls are wired into it. Offline original pins, portable project backups and
lifecycle and retention enforcement remain separate M-07 work.

Verify the browser queue and recovery with npm run test:sync. The Go integration
test exercises real PostgreSQL authorization, conditional writes, replay, quota
accounting paths and owner revocation with TEST_DATABASE_URL set.
