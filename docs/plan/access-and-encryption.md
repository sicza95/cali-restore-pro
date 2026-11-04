# Identity, permissions, encryption and lifecycle

This contract carries forward confirmed privacy/sharing decisions and proposes concrete platform enforcement. It is not approval of a new cryptographic protocol. Implementation starts with M-01 identity, M-03 vault and M-06 sharing; [milestone details](README.md) identify later integration gates.

## Independent authority dimensions

| Dimension                  | Meaning                                                                  | Never implies                              |
| -------------------------- | ------------------------------------------------------------------------ | ------------------------------------------ |
| Account authentication     | Which active account holds the session                                   | Content unlock or membership               |
| Platform role              | Member, delegated administrator or superuser                             | Project ownership or decryption            |
| Server-feature entitlement | Broader hosting/library access, or an accepted invitation to one project | Access to unrelated projects               |
| Project membership         | Owner, assessment view/edit and financial/history scopes                 | Possession of missing private/content keys |
| Cryptographic grant        | Client can decrypt specific permitted records/epochs                     | Server write authorization                 |
| Hosting responsibility     | One eligible owner accepts quota accounting                              | Superior owner powers                      |

The API checks active account, session, entitlement, membership/action/scope, expected revision and current grant/key epoch on every relevant operation. Clients also need appropriate keys. Hiding controls never replaces API enforcement. Keep revocation authoritative in PostgreSQL; avoid long-lived role-bearing JWTs that outlive a policy change.

## Users, superuser and delegated administration

Proposed initial platform roles:

- **Member:** own account/security/preferences and permitted local/project work.
- **Administrator:** explicitly delegated account lifecycle, feature/quota administration and operational health/audit. Cannot promote a superuser or manufacture content/owner grants.
- **Superuser:** administrator rights plus platform-role delegation, bootstrap recovery and deployment-level settings. No automatic project content access and no impersonation/decryption endpoint.

Define named capabilities in one backend policy service, with a tested role mapping. Keep at least one active superuser atomically, including concurrent demotion/suspension/deletion. Do not rely on a hard-coded creator ID. Bootstrap is an explicit server command with a mounted one-time credential, safe rerun behavior and no public default account. Sensitive role/credential/destructive operations require deliberate confirmation and recent credential verification without signing users out of ordinary work.

Registration creates an account with solo local/offline work, not personal cloud storage. Record pending verification, active, suspended and pending-deletion states. Verified address ownership is required for invitation acceptance and server features. User-initiated deletion becomes pending only after project/hosting/pending-work preflight succeeds.

Use Argon2id password verifiers with per-password salts and parameters validated for the deployed resource budget. Opaque high-entropy sessions use secure HttpOnly SameSite cookies and server-side revocation records; protect mutations against CSRF and rotate session identifiers across authentication/privilege transitions. Authentication/reset requests have bounded rate and concurrency limits and neutral responses. Reset tokens are random, single-use, purpose-bound, digest-stored and expiring. Do not use passwords as project keys. Specify token/session timing in M-01; preserve the confirmed absence of routine inactivity logout or idle/background content-lock timers.

Verification, reset, changed-email/security notice and invitation messages use a durable outbox. Link origins come from trusted configuration, not request headers. Bind acceptance to the intended verified account/address. Avoid open redirects. Mail is localized EN/HU and contains no project names/photos/notes/estimate content. Delivery failure is visible and retryable; reissuing a token invalidates obsolete tokens under a recorded policy.

## Project permission matrix

Financial visibility and editing are independent of assessment editing. New non-owner invitations default to assessment view-only, no financial data and current/future assessment history.

| Action                          | Assessment viewer                 | Assessment editor                 | Full-estimate reader       | Estimate editor               | Project owner           | Platform admin/superuser                            |
| ------------------------------- | --------------------------------- | --------------------------------- | -------------------------- | ----------------------------- | ----------------------- | --------------------------------------------------- |
| Read authorized assessment      | Yes                               | Yes                               | With assessment membership | With assessment membership    | Yes                     | No automatic access                                 |
| Change assessment/masks         | No                                | Yes                               | Only if separately granted | Only if separately granted    | Yes                     | No automatic access                                 |
| Read quote summary              | Only with summary/full visibility | Only with summary/full visibility | Yes                        | Yes                           | Yes                     | No automatic access                                 |
| Read project estimate inputs    | No by default                     | No by default                     | Yes                        | Yes                           | Yes                     | No automatic access                                 |
| Change project estimate         | No                                | No by default                     | No                         | Yes, requires full visibility | Yes                     | No automatic access                                 |
| Invite/revoke/manage members    | No                                | No                                | No                         | No                            | Yes                     | No automatic access                                 |
| Add/demote/remove an owner      | No                                | No                                | No                         | No                            | Yes, retain final owner | No automatic access                                 |
| Delete project                  | No                                | No                                | No                         | No                            | Yes                     | Only explicit administrative lifecycle/purge policy |
| Export/backup                   | Permitted content/history         | Permitted content/history         | Permitted content/history  | Permitted content/history     | Full project content    | No decryption                                       |
| Read owner's personal libraries | No                                | No                                | No                         | No                            | Only their own library  | No                                                  |

These columns illustrate orthogonal capabilities, not mutually exclusive roles. Owners have equal full project/estimate rights, including the ability to remove the original creator while preserving at least one owner. Ownership promotion requires a coherent authorized key grant. Hosting transfer requires an eligible owner to accept quota responsibility; changing a role flag cannot produce keys.

**Financial scopes:** assessment only excludes prices, rates, productivity assumptions and estimated hours. Summary is a separate read-only encrypted projection of object subtotals, aggregate project extras/adjustments, before-tax/tax/final totals, currency and revision/date/freshness. Full estimate adds only that project's calculation inputs; personal libraries remain private. If a mask editor lacks financial inputs, they cannot refresh a summary: preserve the previous projection marked stale until an authorized client republishes it.

**History scopes:** new non-owners receive current/future shared assessments/checkpoints by default. Owners can grant selected older checkpoints or all retained older checkpoints. Owners have full project history. Dependencies, estimates and outputs must follow the same scope; a single all-history/all-finance project key is insufficient.

## Content encryption and local device lifecycle

Encrypt source/working images, filenames/metadata, project/object/surface names, masks, geometry, calibration, categories, notes, thumbnails, patterns, checkpoints, branding, reports and all estimate content **before upload**. Server backups/temp/staging obey the same boundary. The service sees only necessary account/routing identities, opaque resource/revision/grant IDs, membership/scopes, public keys/encrypted envelopes, version/key epochs, byte counts and operational timestamps. Document exact minimized essential log fields/retention in M-03; diagnostics opt-in does not expand content permissions.

Use established authenticated-encryption and recipient-wrapping mechanisms with vetted dependencies, format versions, test vectors and a documented key hierarchy. Separate assessment, financial summary, full estimate, personal libraries and restricted historical dependencies. Content/recipient keys remain on authorized clients; infrastructure secrets do not unwrap project content. Bind ciphertext to identity/scope/schema/revision/epoch context, enforce nonce uniqueness and authenticate before parsing. Detect missing/corrupt/swapped chunks; define freshness/rollback limits rather than claiming AEAD alone proves the latest revision. Key-directory substitution and malicious client delivery belong in the threat model.

Trusted unlocked-device approval or a personal recovery key provisions a new device. A login-password reset restores authentication without reconstructing content keys. Losing all trusted devices and recovery material can make content unrecoverable; administrators have no master decryptor. Stable encryption-identity replacement pauses new grants and requires owner review; ordinary device provisioning under the same identity is separate. Optional code/QR verification is available for sensitive projects. Optional passkeys require independent sign-in/unlock compatibility validation and are not a prerequisite for the baseline recovery routes.

Remembered device trust is explicit opt-in; shared devices are session-only. Manual Lock hides live content while preserving account sign-in and encrypted work. Sign-out ends authentication and locks live content while retaining encrypted work and opted-in trust. Forget removes app-managed key access and account-local project/cache copies. Before destroying the only recovery copy/path, require authorized successful sync, verified usable encrypted backup or explicit discard. Forget never deletes server projects, external backups or other devices. Isolate local records/keys/runtime by account; browser termination cannot preserve session-only keys. No inactivity/background auto-lock or routine forced sign-out is added.

## Invitation and revocation state machines

Invitation: `pending acceptance → accepted, awaiting secure grant → active`, with explicit expiry/cancel states. Owner selects account/email, assessment write, financial visibility/write and history scope. Recipient verifies that address and explicitly accepts while signed in. A forwarded bearer link cannot grant a different account access. An authorized unlocked client then publishes the correct recipient envelopes; until that succeeds, show awaiting secure activation. Do not require redundant owner approval when identity and the approved invitation can safely be honored.

Revocation must work across downloads, uploads, history and queued jobs:

1. Owner submits a policy change against the known membership version. Offline UI says pending until the server acknowledges.
2. Server atomically removes/reduces the scope, advances policy state and rejects new read/write/commit attempts in that scope. Existing streams check authorization at bounded chunk boundaries and terminate on received revocation; bytes already delivered remain outside recall.
3. For a read-access reduction, block future confidential publication in affected domains until an authorized remaining client commits a new epoch/recipient set. Old epochs cannot accept new current writes. Write-only reductions change server policy without unnecessarily granting more decryptable content.
4. Affected clients lock access and stop their queue on notification/reconnect. Keep unsent edits as a locked encrypted recovery draft, never an automatically unlocked project fork. Explicit discard is available.
5. Re-grant validates current scope, identity, epoch, base revision and dependencies; it never blindly replays the old queue. Preserve alternatives when edits conflict.

Authenticate every chunk transfer through the API initially; do not issue long-lived direct-download URLs that bypass current membership. Deletion of an envelope cannot recall keys/content already obtained. Offline devices learn revocation on reconnect; no remote erasure or prevention of external copies is promised. Historical re-encryption and precise locked-draft retention need an explicit M-03/M-07 design rather than invented guarantees.

## Quota, hosting and deletion

One server-backed project counts once against its designated hosting owner. That owner must have broader server features; invited owner status alone does not qualify them to host personal projects. Reserve growth and transfer quota atomically. At capacity, reject growth and retain pending local edits; authorized reads, backup and storage-freeing actions remain available. A former host remains accountable until accepted transfer or deletion; no silent charging of another owner.

Broader-feature withdrawal blocks new hosting. Hosted projects pause cloud content updates until an eligible host is restored/accepts transfer; preserve authorized retrieval, ownership management and local work. Membership and independent invitations remain in effect unless separately revoked. Suspension separately blocks server access and revokes sessions without deletion; preserve co-owner access and personal offline work, with shared access locking when received.

Voluntary deletion resolves last-owner projects, accepted key/ownership handover or explicit project deletion, eligible accepted hosting transfer, unsynced work and backup choice. Never cascade through co-owned projects. Forced deletion preserves co-owned projects; sole-owner projects freeze during recovery, permitting existing collaborators only their existing retrieval/export scope. No automatic promotion or administrative key creation.

Deleted projects and deletion-ready accounts have **30 days** of recovery from the applicable deletion action. Offer earlier live purge explicitly. Unrecovered live data is purged at the deadline; deleted encrypted operational-backup copies expire within **90 days total from deletion**, not 90 days after purge. Active checkpoints, surviving projects and external/offline copies do not inherit that timer. Recovery needs valid keys/current grants, retains completed hosting/ownership transfers and does not restore removed memberships. Carry deletion/access records through operational restore so old backups cannot undo policy. Trash remains accounted until purge.

## Verification basis

Test policy through direct HTTP/database integration as well as UI: cross-account IDs; unverified/expired/replayed/forwarded tokens; demoted/suspended sessions; final-owner/final-superuser races; estimates hidden by key scope; invitation cancellation during activation; identity replacement; revoke during download/staging/commit; quota races; missing keys; wrong-key/corrupt recovery; last-copy forget protection; deletion/backup restore after revoke.

Before collaborative production use, perform the previously required concrete cryptographic/key-lifecycle review. Synthetic fixtures and early platform completion are not that qualification.

Primary implementation guidance, consulted 4 November 2026: [password storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html), [session management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html), [CSRF prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html), and [password reset](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html). These support implementation controls; the owner's explicit continuity/manual-lock policy remains the product requirement.
