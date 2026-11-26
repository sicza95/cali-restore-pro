# 0011 · A three-level project browser

Status: Accepted (implemented 2026-11-26) · Date: 2026-11-24 · Decided by: owner

## Context

Projects, restoration objects and surfaces currently share one long editing form.
The browser needs independent navigation and selection at each level without
replacing the surface editor, persistence or project sharing model. The mock's
organisation directory supplies a behavioural reference, not production code.

## Decision

- Reuse one single-selection browser at `/projects`, `/projects/:project` (objects)
  and `/projects/:project/objects/:object` (surfaces). Preserve the editor route
  `/projects/:project/surfaces/:surface`. Initially select the first visible item;
  double-click or Enter opens it. Cards and rows show the preview, name and a corner status icon.
- Toolbar: New on the far left, then shared icon-only item actions, Show, View, Sort, Find,
  Settings and Inspector. Item actions also open from right click, keyboard context-menu, long press, and each item’s vertical ellipsis. Remember grid/list, sort and inspector state per level.
  Use the existing semantic CSS, tokens and typeface with locally bundled Font Awesome icons. Support iPad
  landscape/portrait and desktop (ADR 0003), 44px targets and keyboard navigation.
- Root Settings opens the existing account restoration-defaults/report-branding
  sections. Inside either project browser level, Settings opens the project's
  sync/hosting, backup/export, archive, danger zone and estimate/report/output
  actions. There is no separate more-menu replacement for these settings.
- Info shows selected metadata, a thumbnail gallery, sync/hosting/visibility switches and compact access rosters. Manage holds restoration and branding overrides. Project inspectors additionally edit visibility and reuse existing
  invitations, co-owners and estimate/history scope controls. Child access is
  read-only project-wide information with a project link.
- Default previews are decks of at most three immediate children's representative
  images. A dedicated cover replaces the deck. Covers may reference an existing
  subtree photo or a dedicated vault file. Generate lazy, bounded 320px thumbnails
  in the storage slice; close object URLs and cancel stale work.
- A small custom parser implements name text plus owner, creator, status,
  visibility, created, modified and archived filters. Support quoted/bracketed
  key/value forms and date comparators with diagnostics. No parser dependency.
- Projects retain existing trash/recovery. Object/surface deletion requires a
  descendant-count confirmation and must refuse loss of unresolved journals or
  drafts. Child deletion has no undo in v1. Archive is separate from deletion.
- All new screen wording uses `defineCopy`, EN/HU together and the copy glossary.

## Document contract

`src/platform/projects/browser-contracts.ts` owns metadata, file references,
settings overrides and browser projections. `types.ts` preserves legacy-compatible
`Project`, `RestorationObject` and `Surface` input types; their metadata is optional
only to admit v1 data. `ProjectV2`, `RestorationObjectV2`, `SurfaceV2` and
`SavedProjectV2` expose required metadata for upgraded/new values.

- `version: 2` requires `createdAt`, `updatedAt` and `createdBy` on every entity.
  Timestamps are epoch milliseconds; unknown history is `null`. The project keeps
  its existing known, non-null `updatedAt`. Creator is an account UUID, independent
  of current owners and the hosting account.
- `validateProject(value: unknown, id: string): Project` validates without changing
  the input or its version. V1 retains its old non-empty hierarchy requirement;
  v2 allows empty projects and empty objects.
- `upgradeProject(project: Project): ProjectV2` is pure, preserves content and
  known timestamps, and fills unknown historical metadata with null. A v1 mutation
  that removes the last child is allowed to upgrade to an empty v2 document.
  Listing never upgrades storage. `localProjects(vault).save(...)` upgrades when
  saving an actual mutation and preserves optimistic revision/attachment/journal
  transaction arguments. Mutation callers stamp changed child `updatedAt` values;
  reading or upgrading must not invent a child's modified time.
- New constructors write v2. Existing seeded signatures continue to work while
  callers migrate: `newProject(name, null, null, currency)` creates an empty
  project; `newObject(name)` creates an empty object. Each constructor optionally
  takes a creator account UUID; unknown caller identity stays null.
- Optional `cover: { assetId }` references a subtree photo or a dedicated asset.
  `assets?: ProjectAsset[]` registers dedicated `{ id, purpose: 'cover' | 'branding' }`
  vault files. A branding logo references a registered branding asset. IDs are
  file UUIDs, never URLs or image bytes; references must resolve within the project.
  Storage/backups must enumerate/remap these alongside surface image IDs.
- Optional `overrides.restoration` holds `units` (measurement system), `areaUnit`,
  `reportLanguage` and `snap`; only project overrides accept `currency`.
  `overrides.branding` holds `studio`, `contact`, `footer`, `accent` and `logo`.
  Omitted fields inherit; false and empty text are explicit values; `logo: null`
  clears an inherited logo. Reset removes the field.
- The inheritance root stays the account's existing browser-local preferences.
  A later shared resolver folds legacy units into account → project → object →
  surface precedence and returns value plus source. Currency is project-level
  only and read-only below it. Defaults never rewrite saved inputs, geometry or
  issued reports. No organisation defaults service is introduced.
- Ownership, visibility and browser status are projections, not additional
  authoritative project document fields. Status vocabulary is `local`, `remote`,
  `synced`, `pending`, `conflict`, `error`, `unknown`. Children show their project's
  document status; original availability is a separate field.
- Keep cover and logo bytes outside the approximately 64 KiB synced document.
  Account logo data URLs remain a legacy preference format; the inheritance slice
  must adapt them at the boundary, never copy them into project overrides.

## Visibility and directory API

Migration `0031_project_browser.sql` adds `hosted_projects.visibility` (private by
default), `visibility_version` (initially 1) and `directory_name` (initially empty).
Listing requires a non-empty trimmed name of at most 120 characters. There are no
join-request, invitation, global-defaults or child-ACL tables in this migration.

- `GET /api/v1/hosted-projects/{project}/visibility` returns
  `HostedProjectVisibility = { visibility, version, name }` for a current owner.
- `PATCH` on that path accepts `ProjectVisibilityWrite = { visibility, version,
name }`. Require Origin/CSRF, project ownership and an undeleted project. Compare
  and increment the version atomically with the metadata write. Even name-only
  updates increment it. Stale writes return 409 `visibility_conflict` without
  changing anything. The response is the updated `HostedProjectVisibility`.
  Private projects also submit their current name; this does not rename JSON.
- `GET /api/v1/organisations/{org}/projects?after=<uuid>&limit=50` returns
  `OrganisationProjectDirectory = { projects: ProjectDirectoryCard[], next }`.
  Limit is 1–100; UUID ascending keyset pagination uses an exclusive `after` and
  returns the last UUID as `next` only when more entries exist, otherwise null.
- Require current organisation membership on every directory page, including
  admins. Only listed, non-deleted hosted projects appear. A card is exactly
  `{ id, name, owners: { id, name }[] }`, with current owners ordered by account
  UUID. Profile names may be empty for older accounts; do not publish emails,
  photos, project content, other membership data or descendant previews.
- Private projects remain available through their existing owner-only APIs;
  organisation membership grants no access to private cards or project content.
  Directory-only cards are online-only, not openable, and say to ask an owner for
  access. Local-only projects are private with visibility controls disabled.
- Publishing a name is explicit owner-authorised metadata. After a project rename,
  the integration must refresh the published name with its last visibility version;
  an offline rename can leave the old directory name until the update succeeds.
  Never parse project JSON in the directory endpoint to bypass publication.

These are API contracts for the server slice, not a claim that handlers already
exist. Existing project access guards remain authoritative (ADR 0010).

## Consequences and integration work

The browser replaces the old hierarchy form and accepts empty projects and objects in
both saved documents and shared snapshots. Estimate/report creation and output keep
their empty-selection guards, so an empty folder does not issue an empty report.
Vault backup asset enumeration/remapping, working-image thumbnails and browser
controls are integrated while retaining draft/journal/checkpoint safety. The shared
application frame keeps document scrolling inside the current page and the browser's
collection and inspector inside their own panes. Physical Safari/Pencil and production
qualification remain separate from the synthetic Chrome and disposable-database checks.

## Deferred

- Join requests and a Request access workflow.
- Project invitations for unregistered addresses; a general role-change endpoint.
  V1 uses existing remove/re-invite and scope-edit flows.
- Organisation-owned defaults, live org-group project grants and automatic admin access.
  The project Share modal can invite current organization-group members individually; later membership changes do not alter those grants.
- Publishing cover thumbnails or other images on directory cards.
- Child-level ACLs, multi-select and child deletion undo.

## Alternatives considered

- Replacing the surface editor: unrelated to hierarchical browsing and rejected.
- Upgrading documents during reads: unnecessary writes and invented history.
- Organisation-owned defaults: coherent for collaboration, but deferred by the
  owner in favour of the existing account root for this release.
- Full mock directory/join/membership parity: deferred to keep v1 bounded.

## Browser item actions (2026-11-26)

Download and Share apply to the entire project at every browser level; Make copy
copies the selected subtree, with fresh entity IDs. Project copies receive fresh
file IDs, no sharing or sync checkpoint, and no issued estimates/reports. Same-project
child copies share immutable file references. Rename edits the item inline, saves on
Enter/blur, and cancels on Escape. Existing journal-safe deletion remains authoritative.
Archive is available for each entity; Show includes archived, online and offline
checkboxes, with online/offline initially selected. Online means local sync is enabled
and not paused, or the item is remote-only. A paused sync checkpoint retains queued
edits and the cloud copy. Hosting removal is a separate, explicitly confirmed host-only
operation; a complete local backup must be possible first. Remote access is removed
transactionally, file deletion is queued, and the former host reserves the project ID
for rehosting. Info reports actual charged project storage from the server when hosted;
local/subtree sizes include their document and referenced original bytes, with unknown
shown when originals are unavailable. Older modifier history remains unknown.

The Estimates and reports modal reuses the existing Estimates, Reports and Outputs
pages without changing browser navigation. Scope defaults retain account → project →
object → surface inheritance. Group invitations reuse existing invitation permissions;
they do not introduce section-level project ACLs.
