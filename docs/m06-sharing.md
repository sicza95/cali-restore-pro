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
