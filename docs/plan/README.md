# Platform-first implementation plan

5 November 2026 · PR #7 merged · [M-03 vault implementation](../m03-client-vault.md)

M-00 adds the Go/PostgreSQL Compose substrate while retaining the UI library. See [operations](../../deploy/README.md) and [verification evidence](../m00-verification.md). M-01 is split into M-01a identity core and M-01b registration/mail/auth screens so each has a bounded review. See the [identity core contract](../m01a-identity.md) and [account lifecycle evidence](../m01b-account-lifecycle.md).

Build the complete application around the existing SolidJS UI foundation before implementing image processing or drawing. Identity and authorization are the first functional slice. A small Docker/API/database bootstrap comes immediately before it so identity is built against real persistence and deployment boundaries. Pricing means **restoration-work estimates**; subscription billing and payments are outside this plan.

This delivery order follows the owner's latest direction. It replaces the earlier assessment → estimation → collaboration delivery sequence, while retaining the confirmed product and privacy requirements. Earlier prototype results remain bounded desktop evidence; they do not qualify the new app, its cryptography, or physical iPad/Pencil behavior. No old project/backup migration is required.

## Read this pack

| Document                                            | Decision or contract                                                                     |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| [Architecture](architecture.md)                     | Recommended backend, Docker topology, module ownership, storage and operations           |
| [Access and encryption](access-and-encryption.md)   | Users, superuser, project rights, encrypted grants, invitations, revocation and deletion |
| [Workflows and controls](workflows-and-controls.md) | Complete app routes, user journeys, editor control inventory and mock boundaries         |
| [Estimation and outputs](estimation-and-outputs.md) | Restoration pricing, versioned calculations and late report/export delivery              |
| [Requirements coverage](requirements-coverage.md)   | Every existing catalogue requirement mapped to initial work and final acceptance         |

The recommended stack is **SolidJS/TypeScript + Go + PostgreSQL**, with encrypted binary objects on a persistent Docker volume initially. Stack choices are implementation proposals, not performance results. [Architecture](architecture.md) records their tradeoffs and verification sources. Algorithms, crypto dependencies, decoder/renderer choices and numerical performance budgets still require concrete validation.

## Milestone order

One completed milestone means one reviewable PR. M-12 through M-16 form the final image/drawing phase; they are deliberately separate PRs rather than one engine rewrite.

| Order  | Milestone                                        | Depends on             | Reviewable result / exit gate                                                                                                                                                                                                      |
| ------ | ------------------------------------------------ | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M-PLAN | This plan                                        | Existing UI foundation | Architecture, rights, journeys, control inventory and requirement coverage are documented; runtime unchanged.                                                                                                                      |
| M-00   | Docker and API substrate                         | M-PLAN, UI foundation  | Fresh checkout starts app/API, PostgreSQL and worker through Compose; one-shot migrations, configuration validation, health/readiness checks and CI pass.                                                                          |
| M-01   | Identity, rights, superuser and mail             | M-00                   | Real register/verify/login/logout/reset flows, revocable server sessions, least-privilege policy and bootstrap superuser work end to end against PostgreSQL and a development mail sink.                                           |
| M-02   | Account settings and administration              | M-01                   | Account/security/preferences screens and full admin account/role/grant/quota controls work. Suspension and session revocation are enforced; project-related deletion remains blocked until continuity checks exist.                |
| M-03   | Client vault and device recovery                 | M-02                   | Encrypted local records survive reload; trusted-device/recovery-key unlock, explicit lock/sign-out/forget and account isolation work on synthetic content. Protocol/library choices and test vectors are recorded.                 |
| M-04   | Encrypted file management                        | M-03                   | Immutable original bytes, encrypted chunks/manifests, durable local staging, authorized remote transfer, quota reservations, cancellation, retry and orphan cleanup work without decoding images.                                  |
| M-05   | Projects, objects and surfaces                   | M-04                   | Create/rename/archive/open projects, default object/surface, hierarchy, image attachment/reference roles, encrypted listings, units and versioned settings persist. Reopen reproduces real data.                                   |
| M-06   | Sharing, owner continuity and revocation         | M-05                   | Verified account-bound invitations, scoped grants, multiple equal owners, hosting transfer, history/estimate visibility and acknowledged revocation work using encrypted fixture records.                                          |
| M-07   | Sync, offline work, backup and lifecycle         | M-06                   | Conditional ciphertext revisions, retry/conflict recovery, offline pins, standalone encrypted backup/restore and full project/account deletion-retention flows work under failure injection.                                       |
| M-08   | Complete app workflow and tool UI                | M-07                   | Every route and control in the inventory exists in both themes/orientations and EN/HU. Platform actions use real services; engine actions use explicit review adapters. Workflow, access and failure states have browser coverage. |
| M-09   | Restoration estimation                           | M-08                   | All phase pricing/effort/material/extra/tax/unit rules calculate on client fixtures; versioned private libraries, project snapshots and scoped summaries persist without drawing.                                                  |
| M-10   | Report and export workflow                       | M-09                   | Complete version/surface selection, comparison choices, language, units, branding, scope, preview, draft/final and cancel/error controls; fixture preview clearly labelled.                                                        |
| M-11   | Output encoders                                  | M-10                   | Client-side PDF, SVG, PNG, CSV and XLSX generation passes content/scope tests on known fixtures. Exported bytes are real; fixture measurements remain explicitly illustrative until M-16.                                          |
| M-12   | Large-image import and bounded assets            | M-11                   | Validated JPEG/PNG/TIFF/HEIC/HEIF/DNG/CR2/CR3 paths, originals, working proxies/tiles, orientation/color, cancellation and bounded resources; actual supported variants documented.                                                |
| M-13   | Canonical geometry, transforms and measurement   | M-12                   | Vector masks, master ∩ crop, both calibrations, category unions, main-reference transforms, detail alignment acceptance and measurement validity pass reference/oracle checks.                                                     |
| M-14   | Drawing, points and interaction                  | M-13                   | Brush/erase/pen/shapes/point editing, Pencil/touch navigation, pressure/stabilization, surface-relative sizing and per-stroke/manual commit work through the real engine.                                                          |
| M-15   | History, checkpoints and pattern authoring       | M-14                   | Surface-wide undo/redo, encrypted bounded retained history, layer drafts, comparison/restoration and versioned repeating-tile patterns work with recovery and reachability tests.                                                  |
| M-16   | End-to-end integration and release qualification | M-15                   | Real geometry drives estimates and all outputs; encrypted collaboration, failure recovery, supported browser/device matrix, sustained 4K/8K-class workloads and physical iPad/Pencil checks satisfy recorded release gates.        |

Each milestone also updates its requirement rows and verification evidence. A mock, schema, happy-path demo or successful build alone never closes a behavior requirement.

M-01 has two named sub-milestones, each with its own PR. **M-01a** delivers database account states, password/session APIs, the platform policy service, explicit operator bootstrap and final-superuser protection. **M-01b depends on M-01a** and completes registration/verification, password and email changes/reset, durable localized mail with retry, and all auth screens/session controls. M-02 depends on both. M-01b builds on merged [M-01a PR #4](https://github.com/sicza95/cali-restore-pro/pull/4) on `feat/storybook-foundations`. Retarget after that history reaches `main`.

## Implementation slices within the early PRs

**M-00:** add Go module and HTTP composition; PostgreSQL migrations and configuration; multi-stage image serving the built frontend; Compose app/worker/migrate/db services with development mail sink and optional tunnel profiles; clean-install CI and backup/restore skeleton. Keep the existing `src/ui`, Storybook and verification commands working. No folder migration is required to start.

**M-01:** first add users/account states and the authorization service, then explicit one-time superuser bootstrap and last-superuser protection. Add password hashing, opaque cookie sessions and rate limits before exposing login. Deliver registration, verified email, change email/password, single-use password reset and session management; integrate durable mail outbox retries and neutral templates. Add the actual auth screens in the same PR. Test direct API bypasses and concurrent privileged changes, not only hidden buttons.

**M-02:** build account/preferences/security and admin screens with the shared UI components. Implement bounded account search/pagination, delegated admin permissions, explicit feature grants, quota changes, suspension/re-enable, session revocation, generic audit and mail-job status. Deletion of an account with unresolved project dependencies must fail closed; complete those preflights in M-05 through M-07. Device-key actions enter with M-03, without fake successful trust changes.

**M-03:** document the threat model, exact metadata/log allowlist, authenticated encryption format, recipient identity and scoped/history key design before persisting production content. Use established mechanisms and vetted dependencies rather than inventing cryptography. Implement encrypted local transactions and the device/recovery lifecycle. Demonstrate a fresh-device restore, wrong key, tamper rejection, account switch and interrupted save. The confirmed cryptographic review gate applies before collaborative production use; platform implementation and synthetic tests can continue.

**M-04/M-05:** introduce the minimal opaque project/access-domain/hosting records needed to authorize file staging in M-04, then build the encrypted project document and navigation in M-05. A project is not a single image. Source decoding, masks and calculated areas remain absent. Enforce hosting eligibility and quota on every remote path. Complete project-aware admin and voluntary-deletion preflights as soon as the model exists.

**M-06/M-07:** finish member/grant/hosting state machines before autosync. Verify revocation against an already-open download and a staged upload; pause future publication until remaining members' new key epoch is ready. Build offline queues and conflict UI against that policy, then portable backups and restore-safe deletion records. Independent offline edits are supported; live co-drawing is deferred.

## Before drawing starts

M-11 is the platform completion checkpoint. A user can register, unlock, manage files and projects, share/revoke access, use settings and administration, recover offline work, enter an estimate, and create fixture-based outputs. The entire tool UI is navigable and every control has a recorded owner and availability state. No action claims to have drawn, calibrated, aligned or measured real image content.

M-12 starts complex image work. M-13/M-14 build the actual measurement/drawing system against existing versioned contracts. M-16 replaces fixture providers in the production path, reruns the earlier workflow/access/export checks on real content and qualifies release. Final measurement claims remain unavailable until their source revision, calibration and engine results are valid.

## Commit and PR discipline

- Use conventional commits frequently at coherent boundaries: schema/domain, API/service, UI, failure handling and evidence are useful separate commits. Do not wait for a complete subsystem to make the first commit.
- Use branches such as `feat/m01-identity-and-mail`. Give every milestone its own PR; a milestone that grows beyond coherent review becomes named sub-milestones with separate PRs and updated dependencies.
- Base work on merged predecessors where possible. If stacking is necessary, name the prerequisite PR, target its branch and retarget after it merges. Do not include predecessor changes as unrelated work or auto-merge without instruction.
- Each PR states the user-visible behavior, requirement IDs, migrations/configuration, failure cases, checks actually run and remaining mocks/qualification limits. Include screenshots for UI changes and deployment/restore evidence when relevant.
- Update this plan and coverage when implementation changes a contract. Keep fixture/demo data out of real projects, privileged credentials and test image content out of commits.

## Validation and decisions still to resolve during implementation

Backend changes require policy/domain tests and PostgreSQL integration tests for the affected invariants. Storage changes require interruption, quota and missing/corrupt-chunk checks. UI changes retain `npm run check`, `npm run build-storybook` and `npm test`, with actual landscape/portrait inspection. Compose changes require a clean boot, migration/restart and volume restore. Targeted load checks record throughput, p95 latency, memory, database pool and concurrent upload limits; language choice alone is not evidence of improved app performance.

Choose and record concrete versions/digests in M-00, session/token lifetimes and mail limits in M-01, minimized log retention and crypto/key formats in M-03, chunk/accounting/backup budgets in M-04/M-07, decimal precision in M-09 and decoder/renderer details in M-12/M-13. These are bounded engineering decisions, not missing essential product requirements. Optional passkeys have a separate compatibility gate and must not delay working password authentication or trusted-device/recovery-key access.

Physical 2022 11-inch iPad Pro, Safari tab, Home Screen and Pencil evidence remains pending. Existing desktop prototype performance numbers stay provisional and are not copied into new-app acceptance results.
