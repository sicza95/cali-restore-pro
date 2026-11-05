# M-02 account settings and administration

M-02 builds on rebased and merged [PR #6](https://github.com/sicza95/cali-restore-pro/pull/6) at `7767f39` on `feat/storybook-foundations`.

## Settings and administrative controls

- `/settings/account` shows the signed-in address, links to credential management, and checks deletion eligibility. `/settings/security` retains credential changes and session controls. The user and superuser deletion checks both return `project_continuity_unavailable`. There is no destructive route.
- `/settings/preferences` saves account-specific preferences in the current browser. Theme and transparency apply to the shell. Area units, currency, drawing, independent report language, and branding (including a small PNG logo) are defaults for future project and reporting features. Branding remains on the device. Optional diagnostic consent defaults off; no reporting collector or upload is enabled.
- `/admin` shows server capability scoped controls. Account search matches literal case insensitive email prefixes and returns at most 20 rows plus a cursor. Administrators with lifecycle or entitlement permissions see ordinary members only. Operations-only administrators see mail and audit status without access to account search.
- Platform roles never confer feature entitlements, project membership, or access to content keys. Feature access is explicit and defaults off. Quotas are whole MiB, from 0 to 1,048,576, with zero allocating no capacity. These fields are ready for the project storage milestone; no current usage or project transfer is reported.
- Superusers manage roles and can delegate lifecycle, feature/quota, and operational visibility independently. Existing administrators retain their previous lifecycle authority when migrated. Newly promoted administrators start with no delegated rights. Role or delegation changes revoke the subject's sessions and outstanding account links in the same transaction. Suspension keeps the account and revokes access; re-enabling does not revive revoked sessions.
- Admin mutations require the normal CSRF checks, a deliberate confirmation and credential verification within five minutes. Server authorization runs inside the identity mutation transaction. The database still protects the final active superuser.
- Operations shows mail counts, the latest 20 job statuses, and the latest 25 security events. Job metadata is limited to opaque ID, creation time, status and attempts. Audit metadata is limited to opaque actor/subject IDs, time and action. Mail addresses, payloads, failure strings, project data, secrets and credential material are excluded. The existing worker handles retries. Terminal mail metadata uses the existing seven-day cleanup; audit retention and restore qualification remain future work.

Device trust, local unlock and recovery start in M-03. Ownership/hosting transfer, usage accounting, and deletion safeguards depend on M-05 through M-07. Project report overrides and diagnostics transmission require their own integration and verification.

## Verification

`server/internal/identity/admin_test.go` exercises the real HTTP handlers with the restricted app role on PostgreSQL, including direct calls that bypass the UI. `tests-platform/settings.spec.ts` uses synthetic API responses to exercise browser controls, reload, account separation, credential confirmation and mutation payloads. Its landscape and portrait screenshots are fixture evidence. Physical iPad and Safari qualification remain separate.

Local verification passed: the Go race suite against PostgreSQL, npm type/lint/format checks, production and Storybook builds, 11 Storybook browser tests, and two account settings browser tests with axe. The screenshots use synthetic accounts: [admin in landscape](evidence/m02/admin-landscape-light.png) and [preferences in portrait](evidence/m02/preferences-portrait-dark.png).
