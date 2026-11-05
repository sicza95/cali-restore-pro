# CaliRestore Pro

The first increment is an iPad-first UI library in Storybook: shared tokens, controls, editor panels and interactive review compositions. SolidJS, TypeScript and Vite keep the UI familiar to the existing project while leaving the measurement, rendering, storage and encryption boundaries independent.

## Run locally

Use Node **24.22.2** (see `.nvmrc`).

```sh
npm ci
npm run storybook
```

Open [Storybook](http://127.0.0.1:6006) and start with **Editor → Workspace → Landscape**. The toolbar switches theme and transparency; viewport options include both orientations of the 11-inch iPad Pro. **Start here → Direction** records the visual baseline.

## What is here

- Semantic light/dark tokens, bundled DM Sans, one SVG icon family, spacing and focus rules.
- Buttons, icon buttons, fields, sliders, switches, save status and keyboard-accessible tool rail.
- Layer/category presentation, independent visibility and selection, measurements and photo navigation.
- Landscape, portrait, focus, offline, failed-save, empty and opaque-control editor stories.
- A native calibration dialog demonstrating editable invalid input, validation, keyboard dismissal and focus restoration.
- Strict type checking, ESLint, Prettier, browser interaction/layout/accessibility checks and a CI workflow.

This is a review library. Stories use synthetic in-memory state and a generated conservation photograph. Drawing, history, file import/export, durable saves, account access, encryption and physical Pencil behavior are not connected or qualified here. Unconnected actions are disabled and identified. UI interaction state must not be treated as an acknowledged project save.

## Visual baseline

Tools stay on the left. The photograph gets most of the workspace. Floating tools use restrained transparency; inspectors and forms stay opaque. At portrait widths the inspector docks below the canvas and reduces its viewport. Both themes use the same controls and spacing. See [the direction and interaction notes](docs/ui-direction.md).

## Verify

```sh
npm run check
npm run build-storybook
npm test
```

Local Playwright tests use installed Chrome. CI installs its pinned Chromium version. Screenshots and reports are generated under `test-results/` and `playwright-report/`; they are ignored by Git. Browser viewport checks do not replace physical iPad, Safari or Pencil validation.

## Structure

See the [source layout conventions](docs/source-layout.md) for module boundaries and file size.

```text
.storybook/       Storybook configuration and review controls
src/ui/           UI components and semantic CSS tokens
src/stories/      Review stories and compositions
public/photos/    Generated illustrative reference asset
tests/            Browser interactions, layouts and accessibility
docs/             Agreed visual direction and boundaries
```

M-00 adds a Go/PostgreSQL platform substrate alongside this UI library. M-01a adds [server identity/session APIs and operator superuser bootstrap](docs/m01a-identity.md). M-01b adds [registration, credential recovery, localized mail and account security screens](docs/m01b-account-lifecycle.md). Project, encryption and editing workflows are later milestones. No legacy application code or project formats are imported.

## Run the platform

```sh
npm ci
npm run setup:secrets
docker compose --profile dev up --build -d --wait
```

Open the [app](http://localhost:8080). Docker builds the product frontend and Go 1.27.3 service, starts private PostgreSQL 18.6, runs one-shot migrations, and starts app/worker only after those pass. Node and a shell are absent from the non-root runtime. Existing Storybook commands above remain independent. See [platform operations](deploy/README.md) for configuration, port overrides, health checks, tests, backup/restore, optional mail/tunnel profiles and the production boundaries.

### Sign in to the local app

1. If you need an account, open [Create account](http://localhost:8080/register) and register with a test address such as `restorer@example.test` and a password of at least 15 characters.
2. Open [Mailpit](http://localhost:8025), find the verification email for that address, and follow the link to confirm the account. If you changed the ports in `.env`, use your configured `APP_ORIGIN` for the app and `MAIL_PORT` for Mailpit.
3. Open [Sign in](http://localhost:8080/login) and use the email and password you registered. If you already have a verified account in this local database, start here.
4. To work on projects, select **Projects** after signing in and set up or unlock the browser vault.

For admin access, follow the [one-time superuser bootstrap](deploy/README.md#one-time-superuser-bootstrap-m-01a), then sign in with the credentials you configured.

## Platform implementation plan

The [platform-first implementation plan](docs/plan/README.md) defines Docker deployment, the Go/PostgreSQL backend, identity and superuser management, encryption, files, projects, sharing/revocation, offline recovery, administration, estimates and complete tool UI. Image processing and the drawing engine come in the final phase. Each milestone gets its own PR; [M-00 evidence](docs/m00-verification.md) distinguishes the substrate from later application behavior.
