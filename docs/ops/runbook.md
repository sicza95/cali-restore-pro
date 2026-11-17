# Operations runbook

Scope: running CaliRestore Pro as a single-host Docker Compose deployment (PostgreSQL, app, worker, optional tunnel). It gathers the procedures that the [platform operations guide](../../deploy/README.md) and the [M-07 lifecycle contract](../milestones/m07-deletion-retention.md) describe, in the order an operator needs them. It does not choose a host, recovery objectives or an off-host backup target. Those are owner decisions (issue #53), and the [evidence template](#production-evidence-template) stays empty until a real deployment exists.

Commands run from the repository root of the checked-out release. `<project>` is the Compose project name (default `calirestore`).

## Roles and secrets

| Item                       | Used by                | Notes                                                                                  |
| -------------------------- | ---------------------- | -------------------------------------------------------------------------------------- |
| `app_db_password`          | app, worker            | Password of the non-superuser `calirestore_app` role.                                  |
| `migration_db_password`    | db, migrate, ops tools | Privileged `calirestore_migrator` role. Never mounted into app or worker.              |
| `mail_key`                 | app, worker            | 256-bit hex key that seals queued mail. Identical for both and stable across restarts. |
| `tunnel_token`             | cloudflared            | Only with the `tunnel` profile.                                                        |
| `SMTP_PASSWORD_FILE`       | worker                 | Only for an authenticated relay; added through a Compose override.                     |
| `bootstrap-superuser.json` | bootstrap (one-time)   | Delete after use.                                                                      |

Secrets live in a protected directory outside version control (`SECRETS_DIR`, default `deploy/secrets`, mode 0700). Never put them in images, command arguments, tickets or logs.

## Deploy (first install)

1. Prepare the host: Docker Engine with Compose 2.24 or later, a trusted TLS terminator (reverse proxy or the `tunnel` profile) and a DNS name.
2. Check out the release tag. Create the secrets (`npm run setup:secrets`, or supply protected files yourself) and set `SECRETS_DIR`.
3. Set the production environment in a protected `.env` file or the service manager: `APP_ENV=production`, `APP_ORIGIN=https://<public host>`, `SMTP_ADDRESS=<relay host:port>`, `SMTP_FROM=<sender address>`, `IMAGE_TAG=<release>`. Do not use the `dev` profile.
4. Validate before starting. The check refuses a development origin, the development mail sink, a placeholder sender, the migration role, plaintext database transport to a non-private host and a missing mail key. It needs no database, lists every problem it finds and never prints a secret.

   ```sh
   docker compose build app
   docker compose run --rm --no-deps worker check-config
   ```

   `serve` and `worker` run the same check at startup and exit before connecting to the database.

5. Start with `docker compose up -d --wait`. Migrations run first and gate app and worker.
6. Create the first superuser as the operations guide describes (`docker compose --profile ops run --rm bootstrap`), then delete the one-time credential file.
7. Smoke test through the public origin: `/health/ready` returns 200, sign in, and request a verification mail to confirm the relay delivers.
8. Take the first backup (below) and record the evidence.

## Upgrade

The schema has no rolling-compatibility window: an older binary refuses a newer schema, and the new binary needs its migrations.

1. Read the release notes and `deploy/versions.md` for pin changes. Look at the new files under `server/migrations/` for destructive steps; a destructive migration needs its own rollback note first.
2. Take and verify a backup (below). Keep the archive id.
3. Fetch the new tag and rebuild: `IMAGE_TAG=<new> docker compose build`.
4. Run `docker compose run --rm --no-deps worker check-config` with the production environment.
5. Apply: `IMAGE_TAG=<new> docker compose up -d --wait`. This replaces the old services, runs `migrate`, then starts app and worker.
6. Verify `/health/ready`, worker health (`docker compose ps` shows healthy) and a sign-in.

Never use `docker compose down -v` on a real deployment: it deletes the data volumes.

## Rollback

Migrations only move forward, so the route depends on whether one ran.

- **No migration ran** (the fault is in the image or configuration): set `IMAGE_TAG` to the previous release and run `docker compose up -d --wait`.
- **A migration failed**: its transaction rolled back, so the old image still matches the schema. Fix forward or redeploy the previous tag.
- **A migration succeeded but the release is bad**: the previous binary refuses the newer schema. Restore into a fresh project from the pre-upgrade backup (below), start the previous release there, and retire the failed project. Writes made after the upgrade are lost, so judge this against the agreed recovery point.

## Secret rotation

| Secret                  | Procedure                                                                                                                                                                                                                                                                                                   |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app_db_password`       | Change the role password in PostgreSQL as the migrator (`ALTER ROLE calirestore_app PASSWORD ...`, with psql reading the new value from a file, not a command argument), replace the secret file, then `docker compose up -d --force-recreate app worker`. Changing only the file does not rotate the role. |
| `migration_db_password` | Same order for `calirestore_migrator`. Update the file before the next backup, upgrade or restore, which all use this role.                                                                                                                                                                                 |
| `mail_key`              | Drain the queue first: pause sign-ups and wait until the worker has delivered pending mail. Then replace the file for app and worker together and recreate both. A worker with a different key cannot deliver existing queued mail.                                                                         |
| SMTP password           | Replace the worker secret file and recreate the worker.                                                                                                                                                                                                                                                     |
| Tunnel token            | Create a new token at the provider, replace the file, run `docker compose --profile tunnel up -d --force-recreate cloudflared`, then revoke the old token.                                                                                                                                                  |
| Archive keys            | Not operator-managed. Each operational archive has its own key row in PostgreSQL, which the worker deletes at expiry.                                                                                                                                                                                       |

After any rotation run `check-config`, confirm readiness and record the date in the evidence log. Treat a suspected leak as an incident (below), not only a rotation.

## Backup and restore

Two procedures exist. Use the second for any deployment with accounts or hosted projects.

- **Substrate backup** (`scripts/backup.mjs`, `scripts/restore.mjs`): schema plus object bytes for an empty identity database. CI runs it as a smoke test.
- **Operational archive** (`scripts/operational-backup.mjs`): quiesces app and worker, saves committed encrypted objects to the managed `operational-backups` volume under a fresh per-archive key held in PostgreSQL, and restores into a fresh Compose project against the current database authority.

```sh
node scripts/operational-backup.mjs backup
node scripts/operational-backup.mjs restore <ARCHIVE_ID> <FRESH_PROJECT>
```

Restore procedure:

1. Establish which database is authoritative. Restore needs the current PostgreSQL state; object archives alone do not recover accounts, policy or deletion records.
2. Restore into a **fresh** project name. It refuses a name whose volumes already exist.
3. Wait for object verification. Success fences the old authority and opens the target gate. Failure leaves the target gated: discard it (`docker compose -p <FRESH_PROJECT> down -v`) and retry under a new name.
4. Start the target app and worker, check readiness and a known account, then take a fresh backup there.
5. Retire the source volumes (see the retention checklist).

If a restore is interrupted after fencing and before the gate opens, keep both sides closed until the authoritative database is identified. Never reset the retired-source fence after the target has taken traffic. A stale `.operation` directory in the archive volume marks an interrupted run: confirm its containers have stopped and inspect both gates before removing it.

PostgreSQL dumps and secrets are not part of the operational archive. Move any copy off host only through an encrypted channel, with a lifecycle rule that satisfies the 90-day limit.

### Drill cadence

Re-run the disposable drills after any change to the backup scripts, `internal/oparchive` or migrations, and before the first production cutover. Use throwaway Compose projects and finish with `down -v`. Results are recorded in the [M-07 milestone document](../milestones/m07-deletion-retention.md#disposable-drill-evidence).

```sh
# Substrate drill (secrets must exist)
COMPOSE_PROJECT_NAME=<throwaway> APP_PORT=<free> MAIL_PORT=<free> docker compose --profile dev up --build -d --wait
COMPOSE_PROJECT_NAME=<throwaway> node scripts/backup-smoke.mjs <backup dir> <restore project>

# Operational drill (both project names must start with m07-test-)
COMPOSE_PROJECT_NAME=m07-test-<n>-source APP_PORT=<free> MAIL_PORT=<free> docker compose --profile dev up --build -d --wait
COMPOSE_PROJECT_NAME=m07-test-<n>-source APP_PORT=<free> node scripts/operational-backup-smoke.mjs m07-test-<n>-target
```

## Retention checklist

Deleted content, and the keys needed to recover it, must expire within 90 days of deletion: 30 days of live recovery plus a 60-day archive readability limit. Check monthly and after any infrastructure change.

- [ ] The worker is running and healthy. It deletes expired archive keys and files and live purged objects; after downtime at a deadline, confirm cleanup resumed.
- [ ] The `operational-backups` volume holds no archive older than 60 days.
- [ ] Retired database and object volumes, and their snapshots, are removed within 60 days of the recorded fence time.
- [ ] PostgreSQL WAL archives, base backups and replicas expire by age to meet 90 days. Size limits alone do not prove this.
- [ ] Every off-host destination (objects, database dumps, WAL, snapshots, older object versions) has a lifecycle rule and observed removal.
- [ ] The results are recorded in the evidence template below.

## Incident response

1. **Contain.** Stop the exposure first: `docker compose stop app`, or stop the tunnel (`docker compose --profile tunnel stop cloudflared`). The worker serves no users and can keep running. Do not delete volumes.
2. **Preserve.** Save `docker compose logs --no-color --since <time>` to a protected file and note image tags and times. Logs are minimised and hold no passwords, tokens or content keys, but protect them anyway.
3. **Assess.** Identify the secret, account or volume involved. Check `/health/ready`, recent migrations and recent deployments.
4. **Recover.**
   - Credential or token leak: rotate the secret (above). For user accounts, suspend the account and revoke its sessions in account administration.
   - Data loss or corruption: restore from the latest operational archive into a fresh project (above).
   - Bad release: roll back (above).
5. **Notify.** Tell affected users and the owner. Where personal data of people in the EU may be affected, the regulator notification window is 72 hours from awareness.
6. **Review.** Record the timeline, cause and follow-up issues, and correct this runbook where a step was wrong or missing.

Client content is end-to-end encrypted: the server holds ciphertext and metadata only. State which of the two was exposed.

## Production evidence template

Copy this section into a dated record once a real deployment exists. Leave unknown fields empty rather than filling them with expectations. Do not commit hostnames, account names or secrets to a public repository.

| Field                                                     | Value |
| --------------------------------------------------------- | ----- |
| Date and operator                                         |       |
| Release tag and image digests                             |       |
| Host class and provider                                   |       |
| Agreed RPO                                                |       |
| Agreed RTO                                                |       |
| `check-config` result and date                            |       |
| Latest backup id and date                                 |       |
| Latest restore drill: id, date, measured RTO              |       |
| Restore drill result (gate, hashes, old session rejected) |       |
| PostgreSQL `archive_mode`                                 |       |
| `wal_keep_size`                                           |       |
| `max_slot_wal_keep_size`                                  |       |
| WAL archive destination and expiry rule                   |       |
| Oldest recoverable timestamp                              |       |
| Replication slots and replica lag                         |       |
| Base backups that still hold deleted rows                 |       |
| Retired volumes: fence time and deletion time             |       |
| Off-host destinations (objects, database, WAL, snapshots) |       |
| Off-host lifecycle rules and observed removal             |       |
| Worker uptime and last archive expiry                     |       |
| Secret rotation dates                                     |       |
| Open exceptions                                           |       |
