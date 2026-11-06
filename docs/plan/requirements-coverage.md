# Requirements coverage and acceptance tracking

The status column records implementation and evidence as milestones land. The [preserved acceptance catalogue](requirements-baseline.md) contains the original IDs, priorities and full acceptance text so review does not depend on untracked workspace documents. The [plan](README.md) changes delivery order, not required behavior.

**First** means schema, contract, platform implementation or explicit UI work begins there. **Acceptance** is the earliest planned milestone with the complete real behavior/evidence, not a completion claim. Priority labels are preserved from the earlier delivery baseline; the milestone columns define the new order. Engine-dependent workflows are retested together in M-16 even when a bounded feature can pass earlier. PRIV-03 remains the baseline optional passkey extension with compatibility qualification; its row does not make passkeys a prerequisite for core authentication/recovery.

Source: the owner-confirmed C-121/D-121 baseline and the workspace rebuild catalogue, assessed against the latest 4 November 2026 platform-first direction. Additional confirmed lifecycle, financial, history, source/export and device details are carried into this pack's access, workflow and estimation contracts.

| Requirement | Priority | Behavior                                                            | First | Acceptance | Status  |
| ----------- | -------- | ------------------------------------------------------------------- | ----- | ---------- | ------- |
| PROJ-01     | Must     | Durable project identity, name, and revision                        | M-05  | M-05       | Partial |
| PROJ-02     | Must     | New/Open/Recent/Import are coherent                                 | M-05  | M-08       | Partial |
| PROJ-03     | Must     | Local recovery plus authorized optional remote sync                 | M-03  | M-16       | Partial |
| PROJ-04     | Must     | Self-contained encrypted portable backup                            | M-07  | M-16       | Partial |
| PROJ-05     | Must     | Revision-conflict protection                                        | M-07  | M-16       | Partial |
| PROJ-06     | Must     | Restoration projects contain one or more objects                    | M-05  | M-05       | Passed  |
| PROJ-07     | Must     | Explicit offline selections and protected local work                | M-07  | M-16       | Partial |
| PROJ-08     | Must     | Uncapped initial counts with one active surface                     | M-05  | M-16       | Partial |
| CHECK-01    | Must     | Optional user-named assessment checkpoints                          | M-05  | M-15       | Planned |
| CHECK-02    | Must     | Linked checkpoint comparison with coverage/area changes             | M-08  | M-15       | Planned |
| CHECK-03    | Must     | Recoverable checkpoint restoration                                  | M-08  | M-15       | Planned |
| SURF-01     | Must     | Objects contain named, separately assessed surfaces                 | M-05  | M-13       | Partial |
| SURF-02     | Must     | Shared surface mapping from aligned images                          | M-08  | M-14       | Planned |
| IMG-04      | Must     | Mapping and reference-only image roles                              | M-05  | M-13       | Partial |
| ALIGN-01    | Must     | Automatic-first alignment with user verification                    | M-08  | M-13       | Planned |
| ALIGN-02    | Must     | Detail-photo realignment preserves global drawing                   | M-08  | M-13       | Planned |
| ALIGN-03    | Must     | Accepted partial mapped areas with reference-only fallback          | M-08  | M-13       | Planned |
| IMG-01      | Must     | Seven validated initial image-format families                       | M-04  | M-16       | Planned |
| IMG-02      | Must     | Preserve original source                                            | M-04  | M-13       | Partial |
| IMG-03      | Must     | Large-source import separated from editing                          | M-04  | M-16       | Partial |
| IMG-05      | Must     | 8K-class source-image workload                                      | M-04  | M-16       | Partial |
| FRAME-01    | Must     | Crop, rotate, flip, rectify/perspective and required skew workflows | M-08  | M-13       | Planned |
| FRAME-02    | Must     | Separate view navigation from document transforms                   | M-08  | M-14       | Planned |
| FRAME-03    | Must     | Later main-reference transforms carry shared mask space             | M-05  | M-13       | Planned |
| FRAME-04    | Must     | Main-reference crop clips measurement without deleting drawing      | M-05  | M-13       | Planned |
| CAL-01      | Must     | Two first-class physical calibration methods                        | M-08  | M-13       | Planned |
| CAL-02      | Must     | Calibration provenance and invalidation                             | M-08  | M-13       | Planned |
| CAL-03      | Must     | Reference-format-independent calibration                            | M-08  | M-13       | Planned |
| MASK-01     | Must     | Responsive brush and erase with selectable commit behaviour         | M-08  | M-16       | Planned |
| MASK-02     | Must     | Precise pen and shape workflows                                     | M-08  | M-14       | Planned |
| MASK-03     | Must     | Point and curve editing for every mask                              | M-08  | M-14       | Planned |
| MASK-04     | Must     | Vector mask source of truth with derived display caches             | M-05  | M-13       | Planned |
| MASK-05     | Must     | Source-dependent fine detail without a fixed physical minimum       | M-08  | M-16       | Planned |
| MASK-06     | Must     | Lightweight encrypted recovery of layer-owned painting drafts       | M-03  | M-15       | Planned |
| MASK-07     | Must     | Constant-width defaults with optional pressure-sensitive width      | M-08  | M-16       | Planned |
| MASK-08     | Must     | Optional adjustable stroke stabilization                            | M-08  | M-16       | Planned |
| MASK-09     | Must     | Surface-relative brush and eraser size                              | M-08  | M-16       | Planned |
| LAYER-01    | Must     | Layer CRUD, rename, ordering, visibility, lock, opacity             | M-05  | M-14       | Planned |
| LAYER-02    | Must     | Preserve master/crop measurement with non-destructive drawing       | M-05  | M-13       | Planned |
| LAYER-03    | Must     | Fill, colour, pattern and outline                                   | M-08  | M-15       | Planned |
| LAYER-04    | Must     | Folder-like damage categories with per-layer and union totals       | M-05  | M-13       | Planned |
| LAYER-05    | Must     | Optional nested folders with unique descendant totals               | M-05  | M-13       | Planned |
| HIST-01     | Must     | Chronological, bounded surface-wide undo/redo                       | M-08  | M-15       | Planned |
| HIST-02     | Must     | Multitouch Undo/Redo with a shared rapid-tap window                 | M-08  | M-16       | Planned |
| HIST-03     | Must     | Bounded encrypted local history across reopening                    | M-03  | M-15       | Planned |
| MEAS-01     | Must     | Trustworthy per-layer coverage and area                             | M-08  | M-13       | Planned |
| MEAS-02     | Must     | Explicit measurement states                                         | M-08  | M-13       | Planned |
| MEAS-03     | Must     | Flat-surface measurement with an extensible method boundary         | M-05  | M-13       | Planned |
| MEAS-04     | Must     | Unique overall damage area with full category breakdowns            | M-08  | M-13       | Planned |
| MEAS-05     | Must     | Actual geometry coverage with visual-only opacity                   | M-08  | M-13       | Planned |
| MEAS-06     | Must     | Preserve work and inputs through empty/incomplete assessment        | M-05  | M-16       | Planned |
| MEAS-07     | Must     | Metric/imperial units with project/object/surface inheritance       | M-05  | M-16       | Partial |
| OUT-01      | Must     | Raw mask and composited map exports                                 | M-10  | M-16       | Planned |
| OUT-02      | Must     | Structured measurement data                                         | M-10  | M-16       | Planned |
| OUT-03      | Must     | Printable PDF map and standard client report                        | M-10  | M-16       | Planned |
| OUT-04      | Must     | Separate normal outputs, backups, and diagnostics                   | M-07  | M-16       | Partial |
| OUT-05      | Must     | Explicit assessment versions per report surface                     | M-10  | M-16       | Planned |
| OUT-06      | Must     | Five initial export formats                                         | M-10  | M-16       | Planned |
| OUT-07      | Must     | Optional report branding with defaults/overrides                    | M-02  | M-16       | Partial |
| OUT-08      | Must     | Selected-content-only export files                                  | M-10  | M-16       | Planned |
| OUT-09      | Must     | Export metadata defaults with explicit inclusion                    | M-10  | M-16       | Planned |
| OUT-10      | Must     | Snapshot and editable-estimate XLSX modes                           | M-09  | M-16       | Planned |
| OUT-11      | Must     | Labelled drafts and valid final measurement claims                  | M-09  | M-16       | Planned |
| OUT-12      | Must     | Inherited output units with an individual-output override           | M-05  | M-16       | Planned |
| PRIV-01     | Must     | Client-side content encryption                                      | M-03  | M-16       | Partial |
| PRIV-02     | Must     | Trusted-device and recovery-key content recovery                    | M-03  | M-16       | Partial |
| PRIV-03     | Should   | Optional passkey sign-in and compatible content unlock              | M-03  | M-16       | Planned |
| PRIV-04     | Must     | Explicit opt-in remembered trust and session-only shared devices    | M-03  | M-16       | Partial |
| PRIV-05     | Must     | No routine automatic logout; manual-only local locking              | M-01  | M-16       | Partial |
| PRIV-06     | Must     | Minimum server-readable metadata allowlist                          | M-00  | M-16       | Partial |
| PRIV-07     | Must     | Explicit sign-out/forget protects recoverable work                  | M-03  | M-16       | Partial |
| PRIV-08     | Must     | Explicit opt-in for optional crash/performance reporting            | M-02  | M-16       | Partial |
| SHARE-01    | Later    | Recipient-aware encrypted sharing                                   | M-03  | M-16       | Planned |
| SHARE-02    | Later    | Independent editing with read-only defaults                         | M-01  | M-16       | Planned |
| SHARE-03    | Later    | Three estimate-sharing levels per collaborator                      | M-03  | M-16       | Planned |
| SHARE-04    | Later    | Equal project owners with ownership continuity                      | M-05  | M-07       | Planned |
| SHARE-05    | Later    | Independent/offline collaboration with preserved conflicts          | M-07  | M-16       | Planned |
| SHARE-06    | Later    | Revocation protects online access and future updates                | M-03  | M-16       | Partial |
| SHARE-07    | Later    | Locked local recovery of unsynced edits after removal               | M-03  | M-16       | Planned |
| SHARE-08    | Later    | Owner-controlled older-checkpoint access                            | M-03  | M-16       | Partial |
| SHARE-09    | Later    | Account-bound accepted invitations with identity-change review      | M-01  | M-06       | Planned |
| SHARE-10    | Later    | Read-only quote-level estimate summary                              | M-06  | M-16       | Planned |
| PAT-01      | Later    | Visual repeating-tile pattern editor                                | M-08  | M-15       | Planned |
| PAT-02      | Later    | Reusable versioned patterns with consistent output                  | M-05  | M-16       | Planned |
| EST-01      | Later    | User phase/productivity profiles and layer/detail overrides         | M-09  | M-16       | Planned |
| EST-02      | Later    | Itemized estimate snapshots                                         | M-09  | M-16       | Planned |
| EST-03      | Later    | User-defined work breakdown with editable starter phases            | M-09  | M-16       | Planned |
| EST-04      | Later    | Individual-object, whole-project and selected-object estimates      | M-09  | M-16       | Planned |
| EST-05      | Later    | Independent, explicit scope for every work phase                    | M-09  | M-16       | Planned |
| EST-06      | Later    | One mask per phase with independent cloning                         | M-09  | M-16       | Planned |
| EST-07      | Later    | Three per-phase pricing methods                                     | M-09  | M-16       | Planned |
| EST-08      | Later    | Exactly one editable time/productivity input                        | M-09  | M-16       | Planned |
| EST-09      | Later    | Area-change behaviour follows effort input mode                     | M-09  | M-16       | Planned |
| EST-10      | Later    | User-controlled detail breakdown                                    | M-09  | M-16       | Planned |
| EST-11      | Later    | Manual effort multiplier in initial estimation                      | M-09  | M-16       | Planned |
| EST-12      | Later    | Optional additional material costs per phase                        | M-09  | M-16       | Planned |
| EST-13      | Later    | Final-time input and explicit response to multiplier edits          | M-09  | M-16       | Planned |
| EST-14      | Later    | Optional object/project extras with estimate inclusion              | M-09  | M-16       | Planned |
| EST-15      | Later    | Extra-item price and labour-hour calculations                       | M-09  | M-16       | Planned |
| EST-16      | Later    | Optional monetary percentage adjustments at project level           | M-09  | M-16       | Planned |
| EST-17      | Later    | One currency per project                                            | M-09  | M-16       | Planned |
| EST-18      | Later    | User-controlled repricing after currency changes                    | M-09  | M-16       | Planned |
| EST-19      | Later    | Optional project tax after adjustments                              | M-09  | M-16       | Planned |
| EST-20      | Later    | Monetary rounding and consistent totals                             | M-09  | M-16       | Planned |
| ADMIN-01    | Must     | Consistent account lifecycle UI                                     | M-01  | M-07       | Partial |
| ADMIN-02    | Must     | Privilege and content boundaries                                    | M-01  | M-16       | Partial |
| ADMIN-03    | Must     | Explicit server-feature access grants                               | M-01  | M-07       | Partial |
| ADMIN-04    | Must     | Account quotas with single shared-project accounting                | M-02  | M-07       | Partial |
| ADMIN-05    | Must     | Hosting withdrawal preserves data and project rights                | M-02  | M-07       | Partial |
| ADMIN-06    | Must     | Voluntary deletion resolves project continuity and pending work     | M-02  | M-07       | Partial |
| ADMIN-07    | Must     | Bounded deletion recovery and encrypted-backup expiry               | M-02  | M-07       | Partial |
| ADMIN-08    | Must     | Reversible suspension and explicit forced deletion                  | M-01  | M-07       | Partial |
| UX-01       | Must     | iPad-first core interactions                                        | M-01  | M-16       | Partial |
| UX-02       | Must     | English/Hungarian interface and independent report language         | M-01  | M-16       | Partial |
| UI-01       | Must     | Shared visual/interaction system                                    | M-01  | M-16       | Partial |

## Completion evidence

M-01a adds [identity-core contracts and executed evidence](../m01a-identity.md): PRIV-05 has manual/revocable authentication without idle/absolute expiry (content locking remains M-03); ADMIN-01 has account-state/session APIs but no lifecycle UI; ADMIN-02 has tested least-privilege platform capabilities, operator bootstrap and database-enforced final-superuser protection (project/content scopes remain later); ADMIN-08 has real suspension/re-enable and atomic session revocation (forced deletion remains blocked). PRIV-06 gains an explicit identity-metadata allowlist; full retention/restore/privacy qualification remains open. Registration, verification/reset/change-email/password, mail and auth screens remain M-01b. No row becomes Accepted here.

M-01b adds [account lifecycle and verification evidence](../m01b-account-lifecycle.md). ADMIN-01 gains public registration, verification, recovery and security controls. PRIV-05 gains explicit session controls and revocation on credential changes. PRIV-06 gains a mail metadata boundary and encrypted queue payloads. UX-01, UX-02 and UI-01 gain touch, bilingual and shared-token evidence for the auth surfaces. Full administration, physical device checks, independent report language and release qualification remain in their planned milestones.

M-02 adds [account settings, administration and verification](../m02-account-administration.md). Personal branding defaults and diagnostics consent stay in the browser; reporting remains inactive. Feature grants and quotas are explicit. Account deletion preflight blocks deletion until continuity can be established. Project accounting, withdrawal, and recovery are still open.

M-03 adds [the vault format, threat model and verification](../m03-client-vault.md). PROJ-03 and PRIV-01/02/04/07 have synthetic encrypted local save, recovery, trust, lock and forget evidence. Remote sync, real project data, physical devices, production deployment and cryptographic review remain open. The future scope/history design is documented, but no collaborative grant, editor draft/history or passkey path is implemented.

M-04 adds [encrypted original storage and transfer](../m04-encrypted-files.md). IMG-02/03/05 have opaque, byte-preserving staged import and bounded synthetic transfer evidence; editor integration, format qualification and physical iPad checks remain open. ADMIN-04/05 have single-owner accounting, atomic reservations and hosting-withdrawal evidence; shared ownership and accepted hosting transfer remain open.

PRIV-06 is Partial from M-00: [metadata boundary and verification](../m00-verification.md). The complete privacy acceptance remains M-16; the bootstrap schema does not close encryption or project-content requirements.

When a PR implements part of a row, change its status to Partial and link the PR plus relevant test/evidence record. Mark Accepted only after the full preserved acceptance condition passes, including appropriate failure, permission and device checks. Record any changed behavior as a decision rather than silently rewriting the baseline.

[M-08 application entry evidence](m08-delivery.md#m-08-2-of-8--application-entry-points) extends UX-01, UX-02 and UI-01 with registered navigation, bilingual route states, both tablet orientations, and persisted device/account presentation preferences. PRIV-05 and PRIV-07 gain browser evidence for the separation of signed-in state from vault lock and for restricted direct entry. Full acceptance remains open.

The pre-existing Storybook library is partial UI evidence, not acceptance of UI-01 across the full app. M-08 mocks are control/workflow evidence only. M-09 fixture calculations and M-11 fixture encoders do not establish valid real-image measurements or physical-device capability.

## Additional requirements from the current instruction

| Item                                               | Owner / acceptance                                                                                  |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Docker-served app, old infrastructure as reference | M-00 implemented; [boot, migration, restart and substrate restore evidence](../m00-verification.md) |
| More performant backend option                     | M-00 proposes Go; measured backend load evidence before claiming improvement                        |
| Explicit superuser and rule hierarchy              | M-01/M-02; least privilege, bootstrap and atomic final-superuser protection                         |
| Mailing and registration                           | M-01; verification/reset/security/invitation routing, retry and abuse controls                      |
| Complete tool/control UI before drawing            | M-08; registry and responsive EN/HU review coverage                                                 |
| Restoration-work pricing, no subscription billing  | M-09; confirmed calculation rules and client-only encrypted data                                    |
| PDF/other complex output generation late           | M-10/M-11; fixtures first, real selected-revision qualification M-16                                |
| Image processing/drawing last                      | M-12 through M-16; no production engine hidden inside platform work                                 |
| Frequent commits and a PR for every milestone      | Every milestone; conventional commits, clear dependencies and validation                            |

SHARE-08 evidence: [M-06 selected grants](../m06-sharing.md#selected-checkpoints) cover synthetic checkpoints. Named checkpoint authoring and real dependency enforcement remain planned.

SHARE-06 evidence: [M-06 revocation during transfers](../m06-sharing.md#revocation-during-transfers) covers hosted originals. Live updates to other scopes and offline recovery remain planned.

PROJ-05 and PROJ-07 evidence: [M-07 conditional sync](../m07-conditional-sync.md) covers owner revision conflicts, encrypted offline editor saves and recovery using epoch keys paired between owner devices. [Offline original pins](../m07-offline-originals.md) cover cold offline startup from the cached production app shell, explicit vault unlock, byte-for-byte export and persistent pin removal after a simulated reconnect denial.

PROJ-04 and OUT-04 evidence is in [M-07 portable project backups](../m07-portable-backups.md). The project controls create a dedicated encrypted archive and restore the saved document and referenced originals as a new local copy. Release qualification and future editor and estimate data coverage remain open.

ADMIN-06, ADMIN-07 and ADMIN-08 evidence is in [M-07 deletion and retention](../m07-deletion-retention.md). It covers voluntary preflight, superuser forced deletion, scoped collaborator reads during the sole-owner recovery window, explicit hosting takeover, recoverable trash, early live purge, and a restore drill against pre-revocation and pre-deletion ciphertext. Production infrastructure qualification is separate.

[M-08 project route evidence](m08-delivery.md#m-08-3-of-8--project-routes-and-workflows) extends UX-01, UX-02, PRIV-05 and PRIV-07 with vault-gated opaque project and surface entry, Back and account isolation. PROJ-01 through PROJ-05 and PROJ-07 gain browser evidence for the wired library, originals, backup, sync and recovery paths. Editor computation and physical-device qualification remain open.
