# M-06 sharing, owner continuity and revocation

M-06 starts from [merged PR #10](https://github.com/sicza95/cali-restore-pro/pull/10)
at `403fa41` on `feat/storybook-foundations`.

Migration `0006` separates project ownership from the account charged for
hosting. It backfills the existing host as the first owner of each hosted
project. New projects create the host and first ownership record atomically.
PostgreSQL requires the designated host to be an owner at commit. Deletion
preflight checks ownership, so it can detect a continuity dependency even
when the account does not pay for storage.

Hosted file access and quota accounting use the designated host. The
access and encryption plan defines the remaining content scopes
and the independent cryptographic review
gate.

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

The grant is a single saved revision, capped at 64 KiB of plaintext.
Financial settings stay outside the snapshot. Original files can be
included explicitly as described below. Migration `0009` preserves existing assessment sample grants
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
host. Removing the hosting owner requires an accepted hosting transfer.

The live Chromium test uses three isolated browser contexts and synthetic
active accounts against the Go API and disposable PostgreSQL. It exercises
issuance, acceptance, fingerprint mismatch, recipient-only retrieval,
rejection of altered ciphertext, and reopening the project snapshot after
vault lock. It also checks that non-owners cannot revoke, that the recipient
loses fetch access after owner revocation, and that reissue leaves the old
link unavailable. The same test exercises co-owner activation, management
access, rejection of last-owner removal, and hosting transfer followed by
former-host removal. To run it
against a disposable app, set `SMOKE_ORIGIN`, `M06_OWNER_SESSION`,
`M06_RECIPIENT_SESSION` and `M06_REMAINING_SESSION` for seeded synthetic
sessions. The owner and transfer recipient need hosting entitlement and a
1 MiB quota for the reservation assertions. Recipient addresses are
`recipient@example.test` and `remaining@example.test`. Run
`npm run test:app -- invitations.spec.ts`.

## Hosting transfer

The hosting owner offers the project to another active owner. The offer
leaves hosting and quota attribution with the current host. Only the
designated co-owner can accept the current offer. Acceptance checks hosting
entitlement and available quota, including committed files and staged
reservations, then changes the host and consumes the offer in one
transaction. File operations hold a shared project lock through their
transactions, so they authorize and charge the same host.

Both accounts keep their ownership when hosting changes. The new host can
then remove the former host. Transfer changes server-side storage
responsibility. It does not transfer a previous host's private vault.

## Shared originals

When activating an invitation, the hosting owner can include all attached
originals from the local project, up to 64 files per grant. The browser
uploads their existing encrypted manifests and chunks through the hosted
file API. It includes names and individual file keys inside the authenticated
HPKE envelope. The vault root stays on the owner's device. Migration
`0013` ties each allowed opaque file ID to the invitation grant. Activation
records these links only for committed files in the same hosted project.

The recipient decrypts in the browser, verifies the encrypted manifest and
each chunk, and saves the original. The server checks the recipient and
active grant for metadata and every chunk. Revocation removes those links
with the grant and denies new requests. Already delivered bytes cannot be
recalled. Hosted ciphertext remains under the host's storage quota.

The live browser test downloads and compares the exact original bytes. It
also checks that the transport carries ciphertext and that recipient
metadata, manifest and data requests return 404 after revocation.

## Original-file key rotation

Revoking a file grant or removing its co-owner retires the file versions
they could fetch and advances the project's original-file epoch. New
grants cannot link retired versions. The host can publish new versions
from the encrypted local originals and rotate each affected surviving grant
after verifying its recipient fingerprint again. The browser derives fresh
per-file keys from the new version IDs and encrypts each part before upload.
The server swaps the recipient envelope and file links in one transaction.
Remaining recipients can open their previous grant while rotation is
pending. After rotation, refreshing the inbox opens the replacement grant.

Rotation requires the original sender to still host the project and have
the source files in their unlocked vault. The new ciphertext uses storage
quota alongside historical ciphertext. If the source is unavailable or
quota is exhausted, the replacement does not commit. Already downloaded
originals remain with their recipients.

The live test uses three browser sessions. It checks that the surviving
recipient can download the rotated original and that the revoked
recipient's actual previous file key fails authentication on the new bytes.

### Revocation during transfers

Revocation takes the exclusive project lock. A download checks access for
each part under a shared project lock, so requests authorized after
revocation cannot read another part. A part already authorized may finish;
previously delivered bytes cannot be recalled.

When revocation advances the original-file epoch, it cancels uploads still
staged in that project and makes them eligible for cleanup. While any
surviving invitation still links retired originals, the server rejects
new original-file grants and ordinary file commits with
`409 original_rotation_pending`. The host may stage ciphertext and
commit the specific new versions needed to rotate those grants. The gate
opens after the last affected grant is rotated or removed. Independent
assessment, estimate and checkpoint envelopes retain their existing rules.

The browser test pauses a download after the manifest and revokes access
before forwarding the next part. It also stages an upload before
revocation and checks that it cannot finish. A separate upload staged
after revocation stays unpublished until the surviving grant receives its
new keys.

## Assessment, estimate and history scopes

Assessment is the default grant. Owners can add either an estimate summary
or a full estimate and can independently add a history checkpoint. The
invitation shows the chosen scopes before acceptance. Activation commits
only when the supplied scope envelopes exactly match those choices.

Migration `0015` adds independent HPKE envelopes for the optional scopes.
Each uses a fresh encryption context and authenticates the scope, project,
invitation, sender and recipient. The server returns only the requested
scope for the active recipient. Revocation removes all of the invitation's
envelopes. Original-file rotation replaces the assessment envelope and
preserves any independently granted estimate and history envelopes.

Assessment uses the saved project snapshot. Estimate and history grants
currently carry labeled synthetic records while the estimate and checkpoint
workspaces are pending. The history sample has no financial inputs. The
browser test checks assessment plus summary access for one recipient and
assessment plus full estimate and history access for another. It also
checks unauthorized requests, a ciphertext swap between scopes, and
revocation of the summary grant.

Owners can also change optional scopes on an active invitation. Removing
a scope deletes only its envelope. Adding a scope requires fresh
recipient-encrypted content and fingerprint verification. The server
checks the previous selection so a stale edit cannot overwrite a newer
one. Migration `0016` records the sender for each optional scope so a
co-owner can issue a new envelope under their own verified identity.

The browser test removes full estimate access and verifies that both
estimate endpoints deny access while the same assessment and history
envelopes remain available and open in the recipient's browser. It then
adds summary access and checks that full estimate access stays unavailable.

## Selected checkpoints

After secure activation, a project owner can open **Share selected
checkpoints** on an invitation and share or remove each synthetic inspection
record independently. A recipient can list and open only the checkpoints
granted to their active invitation. The list carries opaque IDs; titles and
descriptions are encrypted. Existing invitations retain their separate
history sample and estimate settings.

Migration `0017` stores one authenticated HPKE envelope per invitation and
checkpoint. Each seal uses a fresh encryption context and binds the checkpoint
ID, project, invitation, sender and recipient. Each sample is self-contained:
it has no image, assessment or estimate keys and grants no dependencies.
Removing one grant leaves the others in place. Revoking the invitation
deletes its checkpoint grants, while original-file rotation preserves them.
Previously fetched content may remain with its recipient.

The live Chromium test exercises two recipients with disjoint selections,
direct requests for ungranted IDs, cross-invitation requests, non-owner
management attempts, ciphertext substitution, vault lock and revocation.
This is evidence for the synthetic sharing workflow. Named checkpoint
authoring, real dependency closures, current/future history access and
report/export integration remain later work.
