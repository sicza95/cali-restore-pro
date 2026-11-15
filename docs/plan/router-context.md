# One router and an app context

Quality baseline [Phase 3 item 2](../reviews/2026-11-14-quality-baseline.md): one router module
(typed routes, guards, deep links) and an app context that replaces the prop-drilled `model`.
Decision record: [ADR 0006](../adr/0006-router-and-app-context.md).

## Today

- **Route parsing is split over three places.** `src/app/main.tsx` checks
  `location.pathname === '/offline-originals'`; `account-access/routes.ts` maps the path to a view
  name once at load (`accountRoute`), plus `signInLink` / `signInDestination` for `?next=`;
  `projects/project-route.ts` holds the project regex and href builders.
- **History is handled in the project workspace.** `ProjectWorkspace` keeps its own route signal,
  calls `history.pushState` and listens to `popstate`. Every other destination is a full page load
  through a plain `<a href>`.
- **Guards are inline JSX.** `AccountAccess` shows "Working…" until the session is loaded, a retry
  button when the session check failed, and "Sign in to open this page" with a `?next=` link when
  signed out. `Admin` hides its content behind `canAdmin()` itself.
- **The god model.** `AccountAccess` calls `createAccountAccess()` and passes the result as `model`
  to `AccountNavigation`, `Profile`, `Preferences`, `Admin`, `AccountSecurity`, `InvitationInbox`
  and `ProjectWorkspace`, which pass it on to `AccountRow`, `AccountDeletion`, `ProjectLifecycle`,
  `ProjectInvitations`, `ProjectOwners`, `EditScopes`, `Checkpoints`, `SharingFingerprint` and
  `useInvitations`. Three files re-declare its type (`SettingsModel`, `InvitationModel`,
  `AccountSecurityProps`).
- **Email link tokens** arrive in the hash (`/verify-email#token=…`); `createAccountAccess` reads
  and strips them.

## URLs that must keep working

| Route name                | Path                                                       | Access    | Notes                                                       |
| ------------------------- | ---------------------------------------------------------- | --------- | ----------------------------------------------------------- |
| `login`                   | `/`, `/login`                                              | public    | `?next=` is a destination name or a project path            |
| `register`                | `/register`                                                | public    |                                                             |
| `recover-deleted-account` | `/recover-deleted-account`                                 | public    |                                                             |
| `forgot-password`         | `/forgot-password`                                         | public    |                                                             |
| `reset-password`          | `/reset-password`                                          | public    | email link, `#token=`                                       |
| `verify-email`            | `/verify-email`                                            | public    | email link, `#token=`                                       |
| `confirm-email`           | `/confirm-email`                                           | public    | email link, `#token=`                                       |
| `projects`                | `/projects`                                                | signed-in | project library                                             |
| `projects`                | `/projects/:project`                                       | signed-in | project detail (UUID)                                       |
| `projects`                | `/projects/:project/surfaces/:surface`                     | signed-in | surface editor (UUIDs)                                      |
| `projects`                | `/projects/:project/estimates` · `/reports` · `/outputs`   | signed-in | review steps                                                |
| `invitations`             | `/invitations`                                             | signed-in | invitation email link; inbox                                |
| `profile`                 | `/settings/account`                                        | signed-in |                                                             |
| `security`                | `/settings/security`                                       | signed-in | default after sign-in                                       |
| `preferences`             | `/settings/preferences`                                    | signed-in | `#report-branding` anchor from private libraries            |
| `libraries`               | `/settings/libraries`                                      | signed-in |                                                             |
| `unlock`                  | `/unlock`                                                  | signed-in |                                                             |
| `devices/approve`         | `/devices/approve`                                         | signed-in |                                                             |
| `admin`                   | `/admin`                                                   | admin     | signed in with `accounts.view` or `operations.view`         |
| `offline`                 | `/offline-originals`                                       | open      | standalone page outside the account shell, works signed out |
| `notFound`                | anything else (bad UUIDs, `/projects/x`, unknown segments) | public    | link back to projects or sign-in                            |

Trailing slashes are ignored, as today for every route except `/offline-originals`, which now
accepts one too. That is the only intended difference.

## Target

- **`src/ui/router/`**, UI-independent apart from one Solid signal:
  - `types.ts`: `AppRoute`, a discriminated union on `name`, with `project`, `surface` and
    `review` fields on `projects`.
  - `constants.ts`: the route table (name → path → access) used by parsing, links and navigation.
  - `routes.ts`: `parseRoute(path)`, `routeHref(route)`, `projectHref`, `projectReviewHref`,
    `signInLink`, `signInDestination`, `followLink` (plain left clicks only).
  - `guard.ts`: `routeGuard(route, session)` → `allow` · `loading` · `retry` · `signIn` ·
    `forbidden`, one pure function replacing the inline JSX conditions and the check in `Admin`.
  - `createRouter.ts`: a `route()` signal, `navigate(href)` (push, then update), `popstate`
    handling and `takeLinkToken()`, which reads and strips `#token=` as today.
- **`src/ui/app-context/`**: `AppProvider` and `useApp()`. The value is the account model from
  `createAccountAccess(entry)` plus `router`. `useApp()` throws outside the provider.
- **Screens** call `useApp()` instead of taking `model`. The three re-declared model types go.
- **Navigation stays as it is**: account destinations are full page loads through `<a href>`, and
  project routes use `navigate` (history push). Moving everything to client-side navigation is a
  shell decision for Phase 2 item 4.
- `projects/project-route.ts` becomes a re-export from the router so the estimate review files
  (`ProjectReview.tsx`, `WorkPhases.tsx`), which another session is restructuring, do not change.
  It goes once that work lands.

## Steps (one signed commit each)

1. This plan and ADR 0006.
2. Router module with the typed route table, guards and Vitest tests (`src/ui/router/*.test.ts`;
   Vitest's `include` grows by that one glob). Callers switch to it; `account-access/routes.ts`
   goes.
3. App context provider; `AccountAccess` renders through it and uses `routeGuard`.
4. Migrate settings and admin screens off `model`.
5. Migrate security, navigation and invitations off `model`.
6. Migrate the project workspace off `model` and onto `router.navigate`.

## Verification

`npm run check`, `npm run test:unit`, `npm test`, `npm run build-storybook`, `npm run test:files`
and `npm run test:app` on a disposable Compose project removed with its volumes. No visible UI
change, so no new screenshots; the existing browser suites cover every route above.
