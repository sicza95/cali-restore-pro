# M-06 sharing, owner continuity and revocation

M-06 starts from [merged PR #10](https://github.com/sicza95/cali-restore-pro/pull/10)
at `403fa41` on `feat/storybook-foundations`.

Migration `0006` separates project ownership from the account charged for
hosting. It backfills the existing host as the first owner of each hosted
project. New projects create the host and first ownership record atomically.
PostgreSQL requires the designated host to be an owner at commit. Deletion
preflight checks ownership, so it can detect a continuity dependency even
when the account does not pay for storage.

File access and quota accounting still use the designated host. The remaining
M-06 work includes verified invitations, recipient identity and key grants,
scope-aware file authorization, equal-owner actions, accepted hosting transfer
and revocation with epoch rotation. The access and encryption plan defines
the acceptance cases and independent cryptographic review gate.

Go formatting, vet and race tests passed against disposable PostgreSQL.
The tests cover upgrading a previously hosted project, creating a project
with its initial owner and rejecting a host who has no ownership record.

## Invitation API

Migration `0007` stores invitations to existing active accounts. An owner
issues an invitation using the recipient's verified email address. The API
binds it to the immutable account ID and the address at issue time. The
recipient can list their pending invitations and explicitly accept one
within 24 hours. Reissue after cancellation or expiry replaces the invitation
ID. Owners can cancel an invitation before secure activation, including
after the recipient accepts.

Acceptance records intent while secure activation is pending. It confers
zero file or project access. Issuance queues a localized email through the
durable outbox in the same transaction as the invitation. The notification
links to the invitation inbox and contains no project identifiers or
acceptance secrets. In the browser, project owners enable hosting, issue
invitations and cancel them before activation. Recipients unlock their vault
to accept and open invitations.

## Secure activation for a project snapshot

The browser registers an immutable P-256 sharing public key against the
authenticated account. The corresponding random seed and peer fingerprints
are encrypted separately in the local vault. Before granting or opening
access, the parties exchange and verify their SHA-256 fingerprints through
a trusted channel. A changed fingerprint for a pinned account stops the
operation. The current vault backup and device transfer cover the original
snapshot. Sharing keys require the browser vault in which they were created.

The owner seals a read-only snapshot of the saved project with authenticated HPKE
(P-256/HKDF-SHA256/AES-128-GCM). Associated data binds both account IDs,
the project and invitation IDs, and the project assessment scope, format
and epoch. The API atomically records the active invitation and ciphertext
only for an accepted invitation with the expected recipient key. Only the
recipient account can fetch it. The browser authenticates and decrypts the
envelope with the pinned sender key before displaying the project name,
revision, object and surface names, and effective surface units.

The grant is a single saved revision, capped at 64 KiB of plaintext. Original
files, attachment references, and financial settings stay outside the
snapshot. Migration `0009` preserves existing assessment sample grants
and labels new snapshots with their own format. Live updates, other
content scopes, sharing identity recovery and rotation
remain separate work. The independent cryptographic review gate continues
to apply to collaborative production use.

Project owners can revoke an active snapshot from the invitation list.
Migration `0010` adds a revoked state. Revocation records that state and
removes the stored envelope in one transaction. Subsequent recipient fetches
return 404, and refreshing the inbox removes the revoked invitation. Reissuing
an invitation creates a fresh ID and requires acceptance and activation
again. A recipient who already fetched content may retain a copy.

Owners can invite a verified account as a co-owner. Migration `0011` stores
the intended role. Acceptance alone leaves ownership unchanged. Secure
activation records the new owner and encrypted project snapshot in the same
transaction. After opening the snapshot, a co-owner can manage invitations
and co-owners from their inbox. They can share the saved revision they
received. Hosted file access and billing still belong to the current host.

Removing a co-owner also revokes their snapshot grant and deletes its
envelope. The server serializes ownership changes with other owner actions
for the same project. It rejects removal of the last owner or the current
host. Removing the hosting owner requires a hosting transfer, which remains
separate work.

The live Chromium test uses two isolated browser contexts and synthetic
active accounts against the Go API and disposable PostgreSQL. It exercises
issuance, acceptance, fingerprint mismatch, recipient-only retrieval,
rejection of altered ciphertext, and reopening the project snapshot after
vault lock. It also checks that non-owners cannot revoke, that the recipient
loses fetch access after owner revocation, and that reissue leaves the old
link unavailable. The same test exercises co-owner activation, management
access, removal, and rejection of last-owner and hosting-owner removal. To run it
against a disposable app, set `SMOKE_ORIGIN`, `M06_OWNER_SESSION` and
`M06_RECIPIENT_SESSION` for seeded synthetic sessions. The owner needs
hosting entitlement and quota. The recipient address is
`recipient@example.test`. Run `npm run test:app -- invitations.spec.ts`.
