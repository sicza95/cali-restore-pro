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
links to the app and contains no project identifiers or acceptance secrets.
Browser controls, scope selection and recipient key verification are
subsequent work.
