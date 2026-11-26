# Requirements coverage and acceptance tracking

The 26 November 2026 browser update adds three-level project/object/surface navigation, explicit empty hierarchies, durable rename/delete/cover operations, account-root settings inheritance and the fixed application frame (PROJ-02, SURF-01, UX-01/02 and UI-01; [ADR 0011](../adr/0011-project-browser.md)). `project-browser.browser.ts`, `project-browser-frame.browser.ts` and `project-hosting.browser.ts` cover persistence, keyboard access, fixed square previews, current-page scrolling and EN/HU hosting errors with synthetic accounts. The complete file/browser suite passes 52 tests with one existing skip; the shared UI suite passes 18 and the unit suite 518. Code checks and Storybook build pass. Race-enabled Go integration tests on a disposable database verify the visibility/directory endpoints and migration 0031. These checks preserve the existing Partial acceptance statuses: physical iPad/Safari/Pencil, production hosting and release qualification remain separate; synthetic account tests are not proof of production saves or end-to-end encryption.

The connection-status follow-up retains a visible, clickable retry on signed-out pages while the service is unavailable. `tests-platform/app.spec.ts` verifies the status action and accessibility in both iPad orientations and themes. All 25 platform E2E tests passed against a fresh disposable stack, alongside code checks, Storybook build and the 18 shared UI tests; the temporary stack and its new volumes were then removed.

Issue #45 adds client-side account navigation ([ADR 0007](../adr/0007-account-client-navigation.md)). UX-01/02 and UI-01 gain document-preserving links, deep-link sign-in returns and account Back/Forward coverage in `tests-platform/account-navigation.spec.ts`; PRIV-05/07 retain route-entry session checks, credential confirmation, vault unmount cleanup and fail-closed expiry/unavailability coverage. These browser fixtures complement the real identity lifecycle in `identity.spec.ts`; they do not qualify physical Safari or change release acceptance.

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
| CHECK-01    | Must     | Optional user-named assessment checkpoints                          | M-05  | M-15       | Partial |
| CHECK-02    | Must     | Linked checkpoint comparison with coverage/area changes             | M-08  | M-15       | Passed  |
| CHECK-03    | Must     | Recoverable checkpoint restoration                                  | M-08  | M-15       | Passed  |
| SURF-01     | Must     | Objects contain named, separately assessed surfaces                 | M-05  | M-13       | Partial |
| SURF-02     | Must     | Shared surface mapping from aligned images                          | M-14  | M-16       | Partial |
| IMG-04      | Must     | Mapping and reference-only image roles                              | M-05  | M-13       | Partial |
| ALIGN-01    | Must     | Automatic-first alignment with user verification                    | M-08  | M-13       | Partial |
| ALIGN-02    | Must     | Detail-photo realignment preserves global drawing                   | M-08  | M-13       | Partial |
| ALIGN-03    | Must     | Accepted partial mapped areas with reference-only fallback          | M-08  | M-13       | Partial |
| IMG-01      | Must     | Seven validated initial image-format families                       | M-04  | M-16       | Partial |
| IMG-02      | Must     | Preserve original source                                            | M-04  | M-13       | Partial |
| IMG-03      | Must     | Large-source import separated from editing                          | M-04  | M-16       | Partial |
| IMG-05      | Must     | 8K-class source-image workload ([desktop profile](perf-budgets.md)) | M-04  | M-16       | Partial |
| FRAME-01    | Must     | Crop, rotate, flip, rectify/perspective and required skew workflows | M-08  | M-13       | Partial |
| FRAME-02    | Must     | Separate view navigation from document transforms                   | M-14  | M-16       | Partial |
| FRAME-03    | Must     | Later main-reference transforms carry shared mask space             | M-05  | M-13       | Partial |
| FRAME-04    | Must     | Main-reference crop clips measurement without deleting drawing      | M-05  | M-13       | Partial |
| CAL-01      | Must     | Two first-class physical calibration methods                        | M-08  | M-13       | Partial |
| CAL-02      | Must     | Calibration provenance and invalidation                             | M-08  | M-13       | Partial |
| CAL-03      | Must     | Reference-format-independent calibration                            | M-08  | M-13       | Partial |
| MASK-01     | Must     | Responsive brush and erase with selectable commit behaviour         | M-08  | M-16       | Partial |
| MASK-02     | Must     | Precise pen and shape workflows                                     | M-08  | M-14       | Partial |
| MASK-03     | Must     | Point and curve editing for every mask                              | M-08  | M-14       | Partial |
| MASK-04     | Must     | Vector mask source of truth with derived display caches             | M-05  | M-13       | Partial |
| MASK-05     | Must     | Source-dependent fine detail without a fixed physical minimum       | M-08  | M-16       | Partial |
| MASK-06     | Must     | Lightweight encrypted recovery of layer-owned painting drafts       | M-03  | M-15       | Passed  |
| MASK-07     | Must     | Constant-width defaults with optional pressure-sensitive width      | M-08  | M-16       | Partial |
| MASK-08     | Must     | Optional adjustable stroke stabilization                            | M-08  | M-16       | Partial |
| MASK-09     | Must     | Surface-relative brush and eraser size                              | M-08  | M-16       | Partial |
| LAYER-01    | Must     | Layer CRUD, rename, ordering, visibility, lock, opacity             | M-05  | M-14       | Partial |
| LAYER-02    | Must     | Preserve master/crop measurement with non-destructive drawing       | M-05  | M-13       | Partial |
| LAYER-03    | Must     | Fill, colour, pattern and outline                                   | M-08  | M-15       | Passed  |
| LAYER-04    | Must     | Folder-like damage categories with per-layer and union totals       | M-05  | M-13       | Partial |
| LAYER-05    | Must     | Optional nested folders with unique descendant totals               | M-05  | M-13       | Partial |
| HIST-01     | Must     | Chronological, bounded surface-wide undo/redo                       | M-08  | M-15       | Passed  |
| HIST-02     | Must     | Multitouch Undo/Redo with a shared rapid-tap window                 | M-14  | M-16       | Partial |
| HIST-03     | Must     | Bounded encrypted local history across reopening                    | M-03  | M-15       | Partial |
| MEAS-01     | Must     | Trustworthy per-layer coverage and area                             | M-08  | M-13       | Partial |
| MEAS-02     | Must     | Explicit measurement states                                         | M-08  | M-13       | Partial |
| MEAS-03     | Must     | Flat-surface measurement with an extensible method boundary         | M-05  | M-13       | Partial |
| MEAS-04     | Must     | Unique overall damage area with full category breakdowns            | M-08  | M-13       | Partial |
| MEAS-05     | Must     | Actual geometry coverage with visual-only opacity                   | M-08  | M-13       | Partial |
| MEAS-06     | Must     | Preserve work and inputs through empty/incomplete assessment        | M-05  | M-16       | Partial |
| MEAS-07     | Must     | Metric/imperial units with project/object/surface inheritance       | M-05  | M-16       | Partial |
| OUT-01      | Must     | [Raw mask and composited map exports][raw-mask]                     | M-10  | M-16       | Partial |
| OUT-02      | Must     | Structured measurement data                                         | M-10  | M-16       | Partial |
| OUT-03      | Must     | Printable PDF map and standard client report                        | M-10  | M-16       | Partial |
| OUT-04      | Must     | Separate normal outputs, backups, and diagnostics                   | M-07  | M-16       | Partial |
| OUT-05      | Must     | Explicit assessment versions per report surface                     | M-10  | M-16       | Partial |
| OUT-06      | Must     | Five initial export formats                                         | M-10  | M-16       | Partial |
| OUT-07      | Must     | Optional report branding with defaults/overrides                    | M-02  | M-16       | Partial |
| OUT-08      | Must     | Selected-content-only export files                                  | M-10  | M-16       | Partial |
| OUT-09      | Must     | Export metadata defaults with explicit inclusion                    | M-10  | M-16       | Partial |
| OUT-10      | Must     | Snapshot and editable-estimate XLSX modes                           | M-09  | M-16       | Partial |
| OUT-11      | Must     | [Labelled drafts and final measurement claims][out11]               | M-09  | M-16       | Partial |
| OUT-12      | Must     | Inherited output units with an individual-output override           | M-05  | M-16       | Partial |
| PRIV-01     | Must     | Client-side content encryption                                      | M-03  | M-16       | Partial |
| PRIV-02     | Must     | Trusted-device and recovery-key content recovery                    | M-03  | M-16       | Partial |
| PRIV-03     | Should   | Optional passkey sign-in and compatible content unlock              | M-03  | M-16       | Partial |
| PRIV-04     | Must     | Explicit opt-in remembered trust and session-only shared devices    | M-03  | M-16       | Partial |
| PRIV-05     | Must     | No routine automatic logout; manual-only local locking              | M-01  | M-16       | Partial |
| PRIV-06     | Must     | Minimum server-readable metadata allowlist                          | M-00  | M-16       | Partial |
| PRIV-07     | Must     | Explicit sign-out/forget protects recoverable work                  | M-03  | M-16       | Partial |
| PRIV-08     | Must     | Explicit opt-in for optional crash/performance reporting            | M-02  | M-16       | Partial |
| SHARE-01    | Later    | Recipient-aware encrypted sharing                                   | M-03  | M-16       | Partial |
| SHARE-02    | Later    | Independent editing with read-only defaults                         | M-01  | M-16       | Planned |
| SHARE-03    | Later    | Three estimate-sharing levels per collaborator                      | M-03  | M-16       | Partial |
| SHARE-04    | Later    | Equal project owners with ownership continuity                      | M-05  | M-07       | Partial |
| SHARE-05    | Later    | Independent/offline collaboration with preserved conflicts          | M-07  | M-16       | Partial |
| SHARE-06    | Later    | Revocation protects online access and future updates                | M-03  | M-16       | Partial |
| SHARE-07    | Later    | Locked local recovery of unsynced edits after removal               | M-03  | M-16       | Partial |
| SHARE-08    | Later    | Owner-controlled older-checkpoint access                            | M-03  | M-16       | Partial |
| SHARE-09    | Later    | Account-bound accepted invitations with identity-change review      | M-01  | M-06       | Partial |
| SHARE-10    | Later    | Read-only quote-level estimate summary                              | M-06  | M-16       | Partial |
| PAT-01      | Later    | Visual repeating-tile pattern editor                                | M-08  | M-15       | Passed  |
| PAT-02      | Later    | Reusable versioned patterns with consistent output                  | M-05  | M-16       | Partial |
| EST-01      | Later    | User phase/productivity profiles and layer/detail overrides         | M-09  | M-16       | Partial |
| EST-02      | Later    | Itemized estimate snapshots                                         | M-09  | M-16       | Partial |
| EST-03      | Later    | User-defined work breakdown with editable starter phases            | M-09  | M-16       | Partial |
| EST-04      | Later    | Individual-object, whole-project and selected-object estimates      | M-09  | M-16       | Partial |
| EST-05      | Later    | Independent, explicit scope for every work phase                    | M-09  | M-16       | Partial |
| EST-06      | Later    | One mask per phase with independent cloning                         | M-09  | M-16       | Partial |
| EST-07      | Later    | Three per-phase pricing methods                                     | M-09  | M-16       | Partial |
| EST-08      | Later    | Exactly one editable time/productivity input                        | M-09  | M-16       | Partial |
| EST-09      | Later    | Area-change behaviour follows effort input mode                     | M-09  | M-16       | Partial |
| EST-10      | Later    | User-controlled detail breakdown                                    | M-09  | M-16       | Partial |
| EST-11      | Later    | Manual effort multiplier in initial estimation                      | M-09  | M-16       | Partial |
| EST-12      | Later    | Optional additional material costs per phase                        | M-09  | M-16       | Partial |
| EST-13      | Later    | Final-time input and explicit response to multiplier edits          | M-09  | M-16       | Partial |
| EST-14      | Later    | Optional object/project extras with estimate inclusion              | M-09  | M-16       | Partial |
| EST-15      | Later    | Extra-item price and labour-hour calculations                       | M-09  | M-16       | Partial |
| EST-16      | Later    | Optional monetary percentage adjustments at project level           | M-09  | M-16       | Partial |
| EST-17      | Later    | One currency per project                                            | M-09  | M-16       | Partial |
| EST-18      | Later    | User-controlled repricing after currency changes                    | M-09  | M-16       | Partial |
| EST-19      | Later    | Optional project tax after adjustments                              | M-09  | M-16       | Partial |
| EST-20      | Later    | Monetary rounding and consistent totals                             | M-09  | M-16       | Partial |
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

[M-10 report workflow evidence](../milestones/m10-reports-and-exports.md) covers encrypted device-local report drafts, scoped issued estimate previews, selected surfaces and fixture comparisons, captured branding, independent EN/HU and units, and output controls (OUT-03, OUT-05 through OUT-08, OUT-10 through OUT-12 and UX-02). Downloads, payload inspection and real assessment qualification remain with M-11/M-16.

[M-11 client export evidence](../milestones/m11-client-exports.md) covers five browser-generated formats, composited fixture maps, numeric and editable workbooks, draft labelling, selection and metadata checks, and abort and size limits (OUT-01 through OUT-03 and OUT-05 through OUT-12). Raw-mask PNG evidence is recorded in the OUT-01 row; explicit source metadata inclusion, real reference images and release qualification remain open. OUT-11 final issuance from complete issued estimates has [rule and browser evidence][out11]; partial totals remain drafts.

[M-09 calculation and persistence evidence](../milestones/m09-restoration-estimates.md) covers fixture arithmetic for EST-01 through EST-20, immutable estimate versions, private encrypted preset copies, selected scope and allowlisted summary/full publication (SHARE-03/10, PRIV-01). Status is Partial, not real-geometry or release acceptance. [Portable backup v2](../milestones/m07-portable-backups.md) adds atomic recovery of project estimate drafts, issued versions and report drafts (PROJ-04). Estimate cloud sync, personal-library recovery and scoped collaboration remain open; later M-10/M-11 evidence covers outputs.

M-01a adds [identity-core contracts and executed evidence](../milestones/m01a-identity.md): PRIV-05 has manual/revocable authentication without idle/absolute expiry (content locking remains M-03); ADMIN-01 has account-state/session APIs but no lifecycle UI; ADMIN-02 has tested least-privilege platform capabilities, operator bootstrap and database-enforced final-superuser protection (project/content scopes remain later); ADMIN-08 has real suspension/re-enable and atomic session revocation (forced deletion remains blocked). PRIV-06 gains an explicit identity-metadata allowlist; full retention/restore/privacy qualification remains open. Registration, verification/reset/change-email/password, mail and auth screens remain M-01b. No row becomes Accepted here.

M-01b adds [account lifecycle and verification evidence](../milestones/m01b-account-lifecycle.md). ADMIN-01 gains public registration, verification, recovery and security controls. PRIV-05 gains explicit session controls and revocation on credential changes. PRIV-06 gains a mail metadata boundary and encrypted queue payloads. UX-01, UX-02 and UI-01 gain touch, bilingual and shared-token evidence for the auth surfaces. Full administration, physical device checks, independent report language and release qualification remain in their planned milestones.

M-02 adds [account settings, administration and verification](../milestones/m02-account-administration.md). Personal branding defaults and diagnostics consent stay in the browser; reporting remains inactive. Feature grants and quotas are explicit. Account deletion preflight blocks deletion until continuity can be established. Project accounting, withdrawal, and recovery are still open.

M-03 adds [the vault format, threat model and verification](../milestones/m03-client-vault.md). PROJ-03 and PRIV-01/02/04/07 have synthetic encrypted local save, recovery, trust, lock and forget evidence. Remote sync, real project data, physical devices, production deployment and cryptographic review remain open. The future scope/history design is documented, but no collaborative grant, editor draft/history or passkey path is implemented.

PRIV-03 (#121) adds optional passkey sign-in as a sign-in factor only ([ADR 0009](../adr/0009-passkey-sign-in-factor.md)): registration and removal after a recent password confirmation, discoverable sign-in with user verification, single-use server challenges, signature-counter and backup-flag tracking, rate limits and security events. Evidence: Go tests with a software authenticator (`server/internal/identity/passkeys_test.go`), conversion unit tests (`src/platform/passkeys/webauthn-json.test.ts`) and a Chromium virtual-authenticator flow (`tests-platform/passkeys.spec.ts`). Content unlock stays with the vault secret by owner decision; physical iPad Safari, synced and third-party passkeys remain the compatibility gate.

M-04 adds [encrypted original storage and transfer](../milestones/m04-encrypted-files.md). IMG-02/03/05 have opaque, byte-preserving staged import and bounded synthetic transfer evidence; editor integration, format qualification and physical iPad checks remain open. ADMIN-04/05 have single-owner accounting, atomic reservations and hosting-withdrawal evidence; shared ownership and accepted hosting transfer remain open.

M-12 adds [bounded image import and variant evidence](../milestones/m12-image-import.md). IMG-01/02/03/05 now have client validation, recoverable encrypted working assets, normalized orientation and color, cancellation, camera-preview spot checks and desktop 8K ingest evidence. Physical iPad/Safari, broad camera coverage and sustained editing qualification remain open.

[M-13 planar assessment evidence](../milestones/m13-planar-assessment.md) covers FRAME-01/03/04, CAL-01 through CAL-03, MASK-04, LAYER-02/04/05, MEAS-01 through MEAS-05 and ALIGN-01 through ALIGN-03. The versioned engine, surface controls, oracle cases and encrypted recovery provide Partial evidence. Drawing gestures, representative calibrated photographs, device qualification and downstream measurements remain open.

MEAS-06 remains Partial pending real-device and release qualification. Unit evidence covers unavailable dependent calculations, preserved manual inputs and editor drawing round-trips. The synthetic `incomplete-assessment.browser.ts` regression saves and reopens empty and uncalibrated partial assessments, then saves, reopens and exports their estimate and report, including an editable workbook. On 2026-11-17 the owner approved including saved unissued estimate versions in owner reports and editable workbooks when labelled as drafts in EN/HU; incomplete estimates remain blocked from issuance. See the M-10 and M-11 decision notes.

[M-15 recovery and versions](../milestones/m15-surface-recovery.md) covers encrypted draft and redo recovery, checkpoint comparison and restoration, and durable pattern versions. M-16 follows with estimate links and output integration.

[M-16 measured integration](../milestones/m16-measured-integration.md) adds committed phase measurement and checkpoint binding (EST-02, EST-05, EST-06, EST-09), selected-assessment draft data across all five formats (OUT-01 through OUT-03, OUT-05, OUT-06), and verified workbook cache and content boundaries (OUT-08 through OUT-12, PAT-02). These rows remain Partial pending the remaining product and device gates in the evidence.

MASK-05 is Partial from #122: [source-pixel detail](../milestones/m14-mask-authoring.md#source-pixel-detail). The owner decided on 2026-11-17 that tolerance and edge budget are in source-image pixels with no fixed physical minimum. Unit evidence in `src/platform/projects/planar-detail.test.ts` covers the cap tolerance bound, detail growing with source resolution, the bounded edge budget, legacy 16-sided marks reproducing and stored tolerance validation; `drawing-document.test.ts` covers the tolerance round-trip. Accepted close-ups, export detail on real photographs and physical device qualification remain open for M-16.

[M-14 mask authoring evidence](../milestones/m14-mask-authoring.md) adds canonical authoring and encrypted commits for SURF-02, FRAME-02, MASK-01 through MASK-04, MASK-07 through MASK-09, LAYER-01 through LAYER-05 and HIST-01/02. Physical iPad input and sustained load, encrypted draft and history recovery, and downstream measurements remain open.

PRIV-06 is Partial from M-00: [metadata boundary and verification](../milestones/m00-verification.md). The complete privacy acceptance remains M-16; the bootstrap schema does not close encryption or project-content requirements.

When a PR implements part of a row, change its status to Partial and link the PR plus relevant test/evidence record. Mark Accepted only after the full preserved acceptance condition passes, including appropriate failure, permission and device checks. Record any changed behavior as a decision rather than silently rewriting the baseline.

[M-08 application entry evidence](m08-delivery.md#m-08-2-of-8--application-entry-points) extends UX-01, UX-02 and UI-01 with registered navigation, bilingual route states, both tablet orientations, and persisted device/account presentation preferences. PRIV-05 and PRIV-07 gain browser evidence for the separation of signed-in state from vault lock and for restricted direct entry. Full acceptance remains open.

The pre-existing Storybook library is partial UI evidence, not acceptance of UI-01 across the full app. M-08 mocks are control/workflow evidence only. M-09 fixture calculations and M-11 fixture encoders do not establish valid real-image measurements or physical-device capability.

## Additional requirements from the current instruction

| Item                                               | Owner / acceptance                                                                                             |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Docker-served app, old infrastructure as reference | M-00 implemented; [boot, migration, restart and substrate restore evidence](../milestones/m00-verification.md) |
| More performant backend option                     | M-00 proposes Go; measured backend load evidence before claiming improvement                                   |
| Explicit superuser and rule hierarchy              | M-01/M-02; least privilege, bootstrap and atomic final-superuser protection                                    |
| Mailing and registration                           | M-01; verification/reset/security/invitation routing, retry and abuse controls                                 |
| Complete tool/control UI before drawing            | M-08; registry and responsive EN/HU review coverage                                                            |
| Restoration-work pricing, no subscription billing  | M-09; confirmed calculation rules and client-only encrypted data                                               |
| PDF/other complex output generation late           | M-10/M-11; fixtures first, real selected-revision qualification M-16                                           |
| Image processing/drawing last                      | M-12 through M-16; no production engine hidden inside platform work                                            |
| Frequent commits and a PR for every milestone      | Every milestone; conventional commits, clear dependencies and validation                                       |

SHARE-08 evidence: [M-06 selected grants](../milestones/m06-sharing.md#selected-checkpoints) cover synthetic checkpoints. Named checkpoint authoring and real dependency enforcement remain planned.

SHARE-01, SHARE-03, SHARE-04, SHARE-09 and SHARE-10 evidence: [M-06 sharing](../milestones/m06-sharing.md) covers account-bound invitations with owner cancellation, pinned sharing-key fingerprints, authenticated HPKE grants per scope (assessment, estimate summary, full estimate, history), co-owners, hosting transfer and last-owner protection, and [M-07 deletion and retention](../milestones/m07-deletion-retention.md) covers ownership continuity on account deletion. Recipients can author their own report drafts from granted content only, kept in their own vault and labelled as recipient drafts on export, with a warning after revocation ([ADR 0008](../adr/0008-recipient-own-reports.md); `src/platform/recipient-reports/scope.test.ts`, `tests-platform/recipient-reports.browser.ts`; SHARE-01, SHARE-03). Estimate and history grants carry synthetic records, grants are read-only snapshots, and the cryptographic review (#52) is open, so these rows stay Partial.

SHARE-05 and SHARE-07 evidence: [M-07 conditional sync](../milestones/m07-conditional-sync.md) covers owner-only revision conflicts that preserve the local draft, but not collaborator edits, merging or recovery after removal. SHARE-02 stays Planned: no non-owner write grant exists.

SHARE-06 evidence: [M-06 revocation during transfers](../milestones/m06-sharing.md#revocation-during-transfers) covers hosted originals. Live updates to other scopes and offline recovery remain planned.

PROJ-05 and PROJ-07 evidence: [M-07 conditional sync](../milestones/m07-conditional-sync.md) covers owner revision conflicts, encrypted offline editor saves and recovery using epoch keys paired between owner devices. [Offline original pins](../milestones/m07-offline-originals.md) cover cold offline startup from the cached production app shell, explicit vault unlock, byte-for-byte export and persistent pin removal after a simulated reconnect denial.

PROJ-04 and OUT-04 evidence is in [M-07 portable project backups](../milestones/m07-portable-backups.md). The project controls create a dedicated encrypted archive and restore the saved document, referenced originals, estimate draft/issued snapshots and report draft atomically as a new local copy. Version 2 preserves issued calculations and revision provenance, remaps copy identities and photo references, and still imports v1 archives without estimate/report records. Unit tests and `tests-platform/project-backups.browser.ts` cover intact recovery, corruption and rollback. Recipient report authoring (#55, [ADR 0008](../adr/0008-recipient-own-reports.md)) keeps a recipient's own drafts in their vault's separate table, outside the owner's backups and normal report store (OUT-04 separation); `src/platform/vault/recipient-reports.test.ts` and `tests-platform/recipient-reports.browser.ts` show the owner report table and backup rows stay empty of them. These rows remain Partial: separate drawing journals and physical-device release qualification remain outside this evidence; personal libraries remain separate by design.

ADMIN-06, ADMIN-07 and ADMIN-08 evidence is in [M-07 deletion and retention](../milestones/m07-deletion-retention.md). It covers voluntary preflight, superuser forced deletion, scoped collaborator reads during the sole-owner recovery window, explicit hosting takeover, recoverable trash, early live purge, and a restore drill against pre-revocation and pre-deletion ciphertext. Production infrastructure qualification is separate.

[M-08 project route evidence](m08-delivery.md#m-08-3-of-8--project-routes-and-workflows) extends UX-01, UX-02, PRIV-05 and PRIV-07 with vault-gated opaque project and surface entry, Back and account isolation. PROJ-01 through PROJ-05 and PROJ-07 gain browser evidence for the wired library, originals, backup, sync and recovery paths. Editor computation and physical-device qualification remain open.

[M-08 drawing review evidence](m08-delivery.md#m-08-5-of-8--drawing-review) covers the transient control and state portions of MASK-01/02/03/07/08/09, LAYER-01/03/04/05 and HIST-01. Geometry accuracy, measured totals, durable recovery and physical input qualification remain open.

[M-08 checkpoint, measurement and pattern review](m08-delivery.md#m-08-6-of-8--checkpoints-measurements-and-patterns) adds evidence for checkpoint selection, comparison and restore review, measurement states and unit display (MEAS-02 and MEAS-07), and pattern presets (PAT-01 and PAT-02). Checkpoint contents, measurement values and pattern changes are illustrative and transient.

[M-08 estimate, report and output review](m08-delivery.md#m-08-7-of-8--estimate-report-and-output-review) covers phase and scope review (EST-02 through EST-09), effort, materials and extras (EST-11 through EST-15), adjustments, currency and tax (EST-16, EST-17 and EST-19), and report selection, previews, branding, formats and units (OUT-03, OUT-05 through OUT-08 and OUT-10 through OUT-12). UX-02 gains a browser check for independently selected report language and units. The invitation checks exercise separate read-only summary and full-estimate envelopes. Calculations, issued snapshots, encoded bytes and real-geometry qualification remain with their owning milestones.

[M-08 closeout](m08-delivery.md#m-08-8-of-8--inventory-and-handoff) links the route and control reconciliation, evidence and remaining gates. FRAME-01/02, ALIGN-01/02/03 and CAL-01 gain preview-control evidence for perspective, the rectification target, viewport pan, editable correspondences and calibration endpoints. These review values have no durable geometry path. UX-01/02 and UI-01 gain the EN/HU and light/dark tablet matrix. PRIV-05/07, PROJ-01/02/04/05/07 and the applicable SHARE rows retain distinct evidence for account/vault gates, encrypted storage, account-bound grants, revocation and reconnect. EST-01 and PAT-02 gain a vault-gated library entry with preset availability documented. Product acceptance statuses remain scoped to each row’s functional and release milestones.

Issue #77 extends ADMIN-01 and UX-02 evidence with bilingual readable operational labels and short copyable references; filled admin pages and expanded mail lists now pass the copy guard. See [M-02 reference evidence](../milestones/m02-account-administration.md#readable-operational-references-77). API metadata, requirement status and physical-device qualification are unchanged.

Issue #111 extends that evidence with current actor/subject account emails and retained mail kinds from the `operations.view`-gated API. PostgreSQL HTTP tests verify access denial, deleted-account nulls and mail kinds after payload erasure; synthetic EN/HU browser checks cover readable labels, fallback labels, full-ID copying and long-email wrapping in both iPad orientations. Requirement status and physical-device qualification remain unchanged.

IMG-05 evidence (#50): the [desktop Chromium profile](perf-budgets.md) imports a synthetic 8192 × 4096 JPEG (13.8 MB), runs a sustained zoom, pan and draw loop and exports an 8000 × 4000 raw mask. Measured on a Windows laptop (Core i7-12800H, Chrome 157, Vite dev server, three runs, 2026-11-17): import 1.21 to 1.27 s; peak main-thread JS heap 244.7 to 244.9 MB (during the import; 10.4 MB retained after drawing); frame p95 16.8 to 16.9 ms with at most 4 of about 1700 frames over 33.4 ms during zoom, pan and draw (frame maximum 17.4 ms for zoom and pan, 33.5 to 66.8 ms for drawing); export 268 to 299 ms. These are provisional desktop budgets with a report-only CI job, not qualification: worker and GPU memory, iPad Safari, Apple Pencil and RAW or large-PNG sources are unmeasured (#49), so IMG-05 stays Partial. The profile also found that PNG sources over about 17 MB are rejected as damaged and that a raw mask over 32 Mpx, which includes 8192 × 4096, cannot be exported.

[raw-mask]: ../milestones/out01-raw-mask-export.md
[out11]: ../milestones/m16-measured-integration.md#out-11--final-report-issuance-2026-11-17-part-of-54

Browser item actions (2026-11-26) extend PROJ and UX evidence: shared context/menu/toolbar actions, inline rename, subtree copies, entity archive filters, thumbnail gallery, scoped defaults and the three review pages in a modal. Synthetic browser scenarios in `browser-item-actions.browser.ts` and `project-browser.browser.ts` exercise real IndexedDB saves, keyboard flows and iPad landscape/portrait layouts. Sync queue unit tests cover pause/reopen/resume without losing queued work. PostgreSQL HTTP tests cover storage accounting, host-only confirmed removal, CSRF, queued file cleanup and host-reserved rehosting. Group selection creates ordinary individual invitations; live group ACLs, unknown historical modifiers and physical Safari/Pencil qualification remain separate. Requirement acceptance statuses are unchanged.
