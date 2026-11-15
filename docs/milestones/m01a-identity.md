# M-01a identity core

This is the first named sub-milestone of M-01, based on merged [M-00 #3](https://github.com/sicza95/cali-restore-pro/pull/3). It supplies the server identity foundation; M-01b completes registration, mail and auth screens. No account/content workflow is accepted solely by this core.

Review: [M-01a PR #4](https://github.com/sicza95/cali-restore-pro/pull/4), targeting the merged prerequisite history on `feat/storybook-foundations`. The local evidence below is separate from GitHub CI results.

## Persistence and authority

Migration `0002_identity.sql` adds accounts, sessions, a sealed bootstrap/active-superuser guard, bounded authentication-rate counters and minimal identity audit events. Accounts have independent `member`, `administrator`, `superuser` roles and `pending_verification`, `active`, `suspended`, `pending_deletion` states. Only active accounts authenticate. Verification/deletion transitions have no endpoint in this slice; changing a policy cannot activate an unverified or deletion-pending account.

The backend maps named capabilities centrally. Members manage their own security; administrators may suspend/re-enable ordinary members and revoke their sessions; superusers also manage platform roles and privileged accounts. Role/state changes revoke every subject session atomically; re-enabling never revives revoked tokens. All changes require explicit confirmation and password verification within five minutes. Neither platform role grants project access, hosting entitlement or content keys. Delegated fine-grained admin capabilities and feature/quota controls arrive in M-02; projects/grants remain later milestones.

All service identity mutations serialize under a transaction advisory lock before rechecking actor authority. A separate database trigger maintains the active-superuser counter through an atomic guard-row update. Once bootstrap seals the guard, its check constraint rejects the last active superuser's demotion, suspension or deletion, including concurrent direct SQL updates. Runtime credentials cannot change the guard, bootstrap accounts, replace password hashes, erase audit history, modify schema history or create tables. The migrator remains an operator credential; this does not defend against a malicious database owner.

## Credentials, sessions and abuse limits

Passwords accept 15 or more Unicode characters, at most 1024 UTF-8 bytes, without normalization or composition rules. Argon2id uses a random 16-byte salt, 19 MiB memory, two iterations, one lane and a 32-byte output. The official Go `x/crypto/argon2` implementation is pinned in `go.mod`. Fixed verifier parsing rejects malformed or unbounded parameters. Missing accounts execute the same verifier path; wrong passwords, unknown, unverified and suspended accounts return the same credential failure.

Session tokens contain 256 random bits; only their SHA-256 digest is stored. A separate public UUID supports session management without exposing bearer tokens. Production uses a `__Host-` Secure, HttpOnly, SameSite=Strict cookie with Path=/ and no Domain. Development HTTP uses a different cookie name. Successful login and credential confirmation always issue new tokens; confirmation consumes the old session. There is a 20-session account cap; reaching it refuses a new login rather than silently signing out another device.

The owner's manual-only sign-out requirement deliberately differs from routine idle/absolute timeout recommendations: there is **no server idle or absolute session expiry**. The persistent browser cookie has the maximum Go cookie age (browsers may cap persistence). Authentication survives an old creation/verification timestamp, while sensitive actions require verification within five minutes. Logout, revocation, suspension and role transitions remove server sessions; reset/password/email security transitions must integrate the same revocation boundary in M-01b. Account authentication does not unlock content. Lock/forget and trusted-device behavior remain M-03.

Every mutation requires the exact configured Origin. Authenticated mutations additionally require `X-CSRF-Token`, derived from the HttpOnly bearer token and returned by login/confirmation or authenticated `me`. Cross-site Fetch Metadata is rejected. JSON bodies are bounded at 4 KiB, reject unknown fields and trailing values, and never accept form data. Responses are no-store and dependency errors stay generic. There is no forwarded-header trust, CORS allowlist or request/body logger.

PostgreSQL fixed windows admit at most 120 credential attempts per minute globally and ten per 15 minutes for a normalized address, across API processes and restarts. A process admits at most two concurrent Argon2 operations (38 MiB KDF allocation, plus runtime overhead), without an unbounded hashing queue. A fixed-window boundary can permit two windows' allowance in quick succession; this is not a sliding-window claim. Rate rejection returns 429/Retry-After. Counters older than 15 minutes are removed on admitted credential requests. These deliberately conservative initial budgets need deployment load validation; the global ceiling also means a distributed attack can deny logins. Network-level abuse controls remain operational work.

## Operator bootstrap

There is no first-visitor or public bootstrap route. In a protected file outside version control, supply JSON with `email` and `password`; no default password is generated or printed. Mount it into the one-shot `bootstrap` service and use the migration credential. The account starts active/superuser: the operator vouches for address ownership out of band. Public address verification arrives in M-01b. The credential file must be removed/protected after use, including operator-managed copies.

Bootstrap serializes with policy changes. Exactly one initial account seals the guard. Repeating the same normalized address succeeds without changing its password/state/role; a different address is refused, even if the original account has since been demoted. Later superusers come only through deliberate authorized role changes. No recovery shortcut or administrator impersonation endpoint exists.

## API surface

All paths are below `/api/v1`; the checked-in OpenAPI contract owns request/response shapes.

| Method/path                                 | Result                                                                                     |
| ------------------------------------------- | ------------------------------------------------------------------------------------------ |
| POST `/auth/login`                          | Verify email/password, issue cookie and CSRF token                                         |
| GET `/auth/me`                              | Current active account, platform capabilities and CSRF token                               |
| POST `/auth/confirm`                        | Verify current password, rotate session, refresh five-minute confirmation                  |
| POST `/auth/logout`                         | Revoke current token and clear cookie                                                      |
| GET `/auth/sessions`                        | Own session UUIDs/creation times and current marker; no tokens/device fingerprint          |
| POST `/auth/sessions/revoke`                | Confirmed recent own single/all revocation; cross-account UUIDs are harmless               |
| POST `/admin/accounts/{id}/policy`          | Confirmed recent permitted role/state transition, transactional subject-session revocation |
| POST `/admin/accounts/{id}/sessions/revoke` | Confirmed recent permitted subject-session revocation                                      |

No UI claims authentication success, mail delivery or content saving in this slice. The existing connection screen remains unchanged. M-01b will consume these contracts and add the missing public account lifecycle.

## Metadata and evidence boundaries

Plaintext allowlist added here: normalized account email/UUID, password verifier, state/role/creation time; session UUID, account UUID, token digest, creation/verification time; rate-bucket SHA-256/window/count; bootstrap account UUID and active-superuser count; audit actor/subject UUID, fixed action and timestamp. Address-bucket hashes are pseudonymous and dictionary-recoverable, not anonymous. No IPs, user agents, attempted raw addresses, request bodies, tokens, project details or content keys enter logs/audits. There is no project content in these tables.

Rate records are pruned after their short enforcement window on subsequent admitted requests. Account/session and minimal identity-audit records currently persist until explicit revocation/operator lifecycle; full minimized retention, restore-safe revocation and deletion policies remain M-03/M-07 and block production qualification. Restoring an old substrate backup can still resurrect authentication sessions: M-00 backups are an operator-only foundation, not a qualified identity recovery mechanism. M-01b must carry security transitions into mail and session invalidation; M-07 must make restore honor revocations/deletion ledgers.

Application logs follow the M-00 fixed-category allowlist. PostgreSQL/ingress error logging must also be reviewed before real account use; the absence of an application request logger does not prove that infrastructure logs exclude SQL parameter/error details.

## Executed verification · 4 November 2026

Linux amd64 containers on the same Docker Desktop/Go/PostgreSQL toolchain as M-00. The runtime checks use a fresh `calirestore-m01a-validation` project with independent volumes and loopback ports 18080/18026. Only randomized synthetic credentials/accounts are created; the real development stack and its volumes remain untouched.

| Check                                                      | Result                                                                                                                                                                                                                                                                              |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Go formatting, vet, race and actual PostgreSQL integration | Pass with the dedicated test database; identity tests create another isolated database so migration-history tampering cannot race them                                                                                                                                              |
| Passwords and least privilege                              | Salt uniqueness, Unicode/wrong-password/malformed-verifier checks; inactive roles and unknown/content/hosting capabilities denied                                                                                                                                                   |
| Bootstrap and database invariants                          | Concurrent different bootstrap attempts have one winner; same-address rerun preserves verifier; app-role bootstrap/guard/hash/audit/schema writes denied; concurrent direct SQL suspension preserves one active superuser; last demotion/suspension/deletion refused                |
| Sessions and authorization                                 | Digest-only storage; old sessions remain authenticated without idle logout; stale sensitive confirmation refused; confirmation rotates and revokes old token; cross-account IDs cannot revoke another account; promotion/admin-over-superuser/unverified activation bypasses denied |
| Policy transitions                                         | Suspension revokes sessions; re-enable does not resurrect them; demotion removes the old administrator session's authority                                                                                                                                                          |
| HTTP boundaries                                            | Trusted Origin, CSRF, JSON type/size/unknown/trailing fields, explicit confirmation, production cookie flags, generic failures and no-store behavior checked through real DB-backed HTTP handlers                                                                                   |
| Abuse/resource bounds                                      | Shared account/global fixed-window ceilings, concurrent rate race, process hashing semaphore, restart persistence and 20-session cap pass                                                                                                                                           |
| Packaged runtime                                           | Fresh Compose boot, mounted-secret operator command and safe rerun, login/me/session list, last-superuser API conflict, password confirmation rotation and logout all pass through the actual Go binary                                                                             |
| Configuration and failures                                 | Missing/relative/malformed/oversized bootstrap secret rejected without logging credentials; migration replay, database outage, worker readiness and restart smoke pass                                                                                                              |
| Frontend compatibility                                     | `npm run check`, `npm run build`, generated API regeneration/drift and both existing product browser checks pass; themes/orientations/axe and unavailable/retry behavior retained                                                                                                   |
| Backup compatibility                                       | Synthetic identity schema/object backup restores into fresh `calirestore-m01a-restore-validation`; existing-volume and tampered-manifest refusals pass; restored writers remain stopped. This does not qualify restore-safe identity revocation                                     |

Final `govulncheck` reports no vulnerabilities after pinning the official crypto revision for GO-2026-5932; the initial finding was in unimported legacy OpenPGP packages. Source/restored identity counts also match: one synthetic account, one active superuser, zero live sessions after logout and one bootstrap audit event. No raw credentials or bearer tokens were printed. Actual PR CI results are separate from these local passes.

`scripts/identity-smoke.mjs` is development-only, requires explicit `IDENTITY_SMOKE_DISPOSABLE=1`, accepts loopback HTTP targets only and refuses a database with existing accounts. It uses a temporary protected credential file, never prints it, and removes it in a finally block. CI runs it against its empty disposable Compose project. The browser UI is unchanged, so no new visual design or physical-device qualification is claimed.

Primary guidance consulted 4 November 2026: [OWASP password storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html), [session management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html), and [CSRF prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html). The manual session policy is an explicit product decision, not a claim of conformity to timeout recommendations.
