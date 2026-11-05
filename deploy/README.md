# Platform operations

Use Docker Desktop with Linux containers (or Docker Engine) and Docker Compose 2.24+; Node 24.22.2 is pinned in `.nvmrc`. Go 1.27.3 and PostgreSQL 18.6 run in pinned containers, so a host Go/PostgreSQL installation is optional. Commands run from the repository root.

## Fresh checkout

```sh
npm ci
npm run setup:secrets
docker compose --profile dev up --build -d --wait
```

Open the [app](http://localhost:8080) and [development mail viewer](http://localhost:8025). If a port is occupied, copy `.env.example` to `.env` and change `APP_PORT`/`APP_ORIGIN` or `MAIL_PORT`. The local verification machine uses `MAIL_PORT=18025` because another application owns 8025. PostgreSQL and SMTP have no published ports. App and mail viewer bind only to loopback; only those services and the optional tunnel join the ingress network. The database, migrator and worker stay on the internal network.

The app serves account access and security screens. The worker delivers verification, reset and security messages to Mailpit in the development profile. Mailpit exposes message bodies and links to anyone with access to the viewer. Use synthetic accounts in development.

## Account mail

For an existing checkout, rerun `npm run setup:secrets` to add `mail_key`, then rebuild the stack and apply migration 0003. The app and worker use the same mounted key. Keep it stable across restarts and store it separately from the database backup. A worker with a different key cannot deliver existing queued mail.

Compose defaults to `mail-sink:1025` with a development sender. For a production deployment, configure `SMTP_ADDRESS`, `SMTP_FROM`, and worker access to a trusted SMTP relay. Production requires certificate-verified STARTTLS. For authenticated SMTP, pass `SMTP_USERNAME` and mount a worker-only `SMTP_PASSWORD_FILE` using a Compose override. Production relay delivery and recovery qualification remain separate gates. See the [account lifecycle contract](../docs/m01b-account-lifecycle.md).

## One-time superuser bootstrap (M-01a)

After applying migrations, create a protected, ignored `deploy/secrets/bootstrap-superuser.json` containing `email` and `password` JSON strings. Use your own address and a unique password of at least 15 characters (maximum 1024 UTF-8 bytes); no example/default credential is provided. Do not pass the password in shell arguments or commit the file. Alternatively set host `BOOTSTRAP_CREDENTIAL_FILE` to a protected file path. Run:

```sh
docker compose --profile ops run --rm bootstrap
```

This separate service mounts the operator migration credential and the one-time file, with no listener, published port or content volume. App/worker never receive either credential. A successful command records one active initial superuser without exposing its identity/password in logs. Repeating the same address is a no-op; another address is refused. A rerun never resets the password or repairs a demoted/suspended account. Remove the one-time file and protect any copies after use. Do not bootstrap a real account into a shared/demo environment by automation. The operator establishes bootstrap address ownership out of band. See the [identity contract and limitations](../docs/m01a-identity.md).

Storybook remains separate and uses its original commands and synthetic data:

```sh
npm run storybook
npm run check
npm run build-storybook
npm test
```

`npm run build` builds the product entry through `vite.app.config.ts`. It excludes Storybook's generated photograph, stories and review state. The Go server serves the resulting assets and `/api/v1` on one origin. Node is absent from the runtime image.

## Configuration and secrets

`npm run setup:secrets` creates two independent random 256-bit passwords and a separate 256-bit mail key in ignored `deploy/secrets`, without printing or replacing them. The private host directory is mode 0700, with files readable by the non-root container through Compose's file secret mounts. Protect this directory with equivalent Windows ACLs. Production operators supply protected secret files themselves. Never bake secrets into images, commit them, or place passwords in command arguments.

| Setting                                             | Meaning                                                                                       |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `APP_ENV`                                           | `development` or `production`; unknown values fail startup                                    |
| `APP_ORIGIN`                                        | HTTP(S) origin; production requires HTTPS and forbids URL credentials/path/query              |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`          | Database connection coordinates; Compose sets explicit roles                                  |
| `DB_PASSWORD_FILE`                                  | Mounted secret; required in production; passwords shorter than 32 bytes fail                  |
| `DB_PASSWORD`                                       | Native development alternative; cannot coexist with the file setting                          |
| `DB_SSLMODE`                                        | `verify-full` by default; Compose explicitly uses `disable` inside its private Docker network |
| `HTTP_ADDR`                                         | Native bind address, default `:8080`                                                          |
| `STATIC_DIR`, `OBJECT_DIR`, `WORKER_HEARTBEAT_FILE` | Absolute runtime paths; defaults `/app/web`, `/data/objects`, `/tmp/worker-heartbeat`         |
| `SECRETS_DIR`, `IMAGE_TAG`, `APP_PORT`, `MAIL_PORT` | Compose interpolation overrides; see `.env.example`                                           |

PostgreSQL initializes `calirestore_migrator` and the separate non-superuser `calirestore_app` role only on a fresh volume. The app and worker receive only the application password. M-00 grants them schema usage and migration-history reads, without DDL or migration-history writes. Later migrations must grant only their needed table operations. The migrator is a privileged operational credential; it is never mounted into the app/worker. Changing a secret file does not rotate an existing PostgreSQL role password; coordinate database password rotation with mounted secret replacement and service restart.

Run production with `APP_ENV=production`, a trusted HTTPS `APP_ORIGIN`, protected secret files, and an operated TLS reverse proxy or configured tunnel. Do not enable the development profile. The application does not trust forwarded headers. For an external database use `verify-full` and trusted CA configuration; never send these private-network plaintext database connections over a public network.

The optional `tunnel` profile uses a digest-pinned Cloudflared image and `/run/secrets/tunnel_token`. An operator must supply the real token and configure the tunnel destination as `http://app:8080`. Starting that profile publishes the configured hostname; M-00 does not enable it automatically. Trusted HTTPS for LAN/iPad review must terminate at the operated proxy/tunnel; do not expose a plaintext LAN listener as a substitute. No real tunnel/hostname qualification is claimed here.

## Schema and service lifecycle

`docker compose up` gates the one-shot migration on PostgreSQL health, then app/worker on successful migrations. `docker compose run --rm migrate` is safe to repeat. SQL files are embedded, applied in a single transaction under an advisory lock and recorded with SHA-256 checksums. Unknown/modified history fails closed. Do not edit an applied migration: add the next numbered SQL file.

M-00 requires an exact known schema history. There is no rolling schema compatibility window yet. Stop writers, back up, run the next reviewed migrations and start their compatible image together. A failed migration transaction rolls back; a future destructive migration requires its own rollback/restore runbook. Starting an older binary against a newer schema fails readiness.

`/health/live` checks the HTTP process only. `/health/ready` and `/api/v1/status` require a reachable database with compatible migration history, with a two-second deadline. Readiness returns 503 on dependency loss and recovers without restarting the process. The worker removes its readiness heartbeat on dependency loss and recreates it on recovery; `worker-healthcheck` exposes this without a public listener. App/worker stop on SIGTERM; HTTP requests drain within ten seconds. Database pool bounds are eight connections per process.

The runtime uses UID/GID 65532, a read-only root filesystem, dropped capabilities and a small writable tmpfs. Only the private objects volume is persistent writable app storage; no file API exists yet. Static hashed assets are immutable-cacheable; index responses revalidate and operational API responses are no-store. Missing API routes/assets return 404, rather than an HTML success response. CSP permits same-origin resources only.

## Verify and regenerate

```sh
npm run api:generate
docker compose -f compose.yaml -f deploy/compose.test.yaml run --build --rm test
docker run --rm calirestore-test:local go run golang.org/x/vuln/cmd/govulncheck@v1.9.0 ./...
npm run test:app
npm run test:platform
```

The test overlay creates an independent disposable PostgreSQL database. Its Go suite checks formatting, vet, race detection, serialized/idempotent migration application, schema drift and application-role permission denial. Never set `TEST_DATABASE_URL` to a real database: that test intentionally replaces its migration table. The smoke command temporarily stops the application's database and restarts services; run it on a disposable local/CI stack, not a shared deployment. It checks real readiness/liveness, worker dependency loss, missing routes/assets, migration replay, non-root/read-only runtime and recovery. The app browser tests cover real same-origin connectivity, explicit failure/retry, both themes/orientations and accessibility. `SMOKE_ORIGIN` overrides the test target when changing the published app port.

`contracts/openapi.json` owns the operational API types. The pinned generator writes `src/platform/api`; CI rejects generated drift. Frontend and backend scans run in CI, alongside the retained UI workflow. Container tags and immutable digests live in `Dockerfile` and Compose; update them in reviewed commits with boot/restore evidence. See [versions and licenses](versions.md).

## Backup and isolated restore skeleton

```sh
node scripts/backup.mjs deploy/backups/local-check
node scripts/restore.mjs deploy/backups/local-check calirestore-isolated-restore
```

For a disposable verification run, `node scripts/backup-smoke.mjs deploy/backups/probe calirestore-restore-probe` also checks synthetic object bytes, refusal to reuse destination volumes and rejection of a corrupted manifest hash. It briefly stops the source app/worker and leaves the destination isolated for review.

Backup requires a running app/worker, stops both writers, creates a custom PostgreSQL dump and objects tar, records schema checksums and file hashes, then restarts the services even on failure. A completed `manifest.json` identifies a complete set. Failed/incomplete directories remain for diagnosis and cannot be overwritten. PostgreSQL roles, passwords and client content keys are excluded; protect infrastructure secrets separately. This is an unencrypted local backup skeleton; protect the directory and move backups only through a reviewed encrypted channel/store.

Restore verifies the manifest and both hashes before creating anything, refuses existing destination volumes, initializes a fresh database/application role using the supplied secret files, seeds objects-volume ownership from the runtime image without starting it, restores both volumes, compares schema history and checks migration compatibility. It leaves app/worker/tunnel stopped for review. Use only trusted backups. It never overwrites a live deployment. Inspect the isolated copy, then choose a separate local app port/origin before intentionally starting its app/worker.

This qualifies only the M-00 schema and synthetic object bytes. M-04 verifies parts at commit and retrieval and blocks substrate backup/restore when hosted projects exist. M-07 must add committed-object backup manifests/watermarks, an independently current revocation/deletion ledger, infrastructure-key recovery, and actual 30-day/90-day lifecycle enforcement before production project recovery is safe. A successful substrate restore does not qualify those workflows.

`docker compose down` preserves both named data volumes. Remove volumes only for an explicitly disposable project; never use `down -v` as a normal upgrade or restart command.
