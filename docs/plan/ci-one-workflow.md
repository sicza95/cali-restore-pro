# One CI workflow

Quality baseline [Phase 4 item 1](../reviews/2026-11-14-quality-baseline.md): merge the "Platform
substrate" and "UI library" workflows into one workflow with parallel jobs.

## Today

Two workflows, each with one serial `verify` job, both on every push to `main` and every pull
request. On `main` the UI job takes about 1.5 min and the platform job about 5.5–6 min. The UI job
repeats `npm ci` and the Playwright install that the platform job also does.

## Target

`.github/workflows/ci.yml`, named `CI`, with three jobs that start together:

| Job        | Checks                                                                                                                                                                                                                                                               |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `frontend` | `npm run check` (typecheck, lint, format), API client drift (`api:generate` + `git diff`), `npm audit --audit-level=high`, `npm run build`, `npm run build-storybook`, `npm test`                                                                                    |
| `go`       | `gofmt -l`, `go vet`, `go test -race -count=1` against a disposable Postgres service (same image digest as `deploy/compose.test.yaml`), `govulncheck@v1.9.0`                                                                                                         |
| `e2e`      | `docker compose config`, dev stack up, backup and isolated restore smoke, identity smoke, `test:platform`, `test:sync`, `test:files`, `test:app`, encrypted file transfer smoke, operational archive restore, diagnostics on failure, cleanup of disposable projects |

- **Caching:** npm through `setup-node`, Go modules and build cache through `setup-go`
  (`server/go.sum`).
- **Concurrency:** one group per workflow and ref; a newer push cancels a superseded pull request
  run. Runs on `main` are never cancelled.
- **Go version:** `setup-go` reads `server/go.mod` (`go 1.27.4`), the same version the Dockerfile
  pins. The Dockerfile's `test` stage is no longer run in CI; the `e2e` job still builds the
  backend stage it shares with `compile`.
- **Room for Vitest:** Phase 3 item 1 adds a fourth `unit` job beside `frontend`. A comment in the
  workflow marks the spot. Not added now.
- `push` triggers on `main` only. The platform workflow also listed `master`, which does not exist
  in this repo.

## Branch protection

The `main` ruleset requires signatures, linear history and blocks deletion. It requires no status
checks, so the renamed checks need no ruleset change.

## Done

- The old two workflows are deleted; every step they ran maps to a job above.
- The pull request's three jobs are green on GitHub; every commit is Verified.
- The PR lists the old check → new job mapping and run times before and after.
