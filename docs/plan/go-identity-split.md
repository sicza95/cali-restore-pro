# Split Go `internal/identity` into domain packages

Quality baseline [Phase 3 item 5](../reviews/2026-11-14-quality-baseline.md). Structure only: no
HTTP route, status code, JSON shape, SQL, lock order or schema changes. `go build`, `go vet`,
`gofmt` and `go test -race ./...` (with `TEST_DATABASE_URL`) pass after every commit.

## Starting point

`server/internal/identity` holds 37 files (about 5,900 lines) in one package, imported only by
`cmd/calirestore`. It mixes:

- **Accounts and sessions:** login, sessions, revocation, role and state policy, capabilities,
  registration and e-mail links, admin listing and controls, superuser bootstrap, mail outbox.
- **Hosted projects:** encrypted files and their object storage, revisions and revision keys,
  checkpoints, hosting transfer, co-owners.
- **Sharing:** invitations, scopes, activation, original-key rotation.
- **Deletion:** account and project trash, recovery, the purge worker, restore verification.
- **Operations:** operational archive key expiry.
- **Shared plumbing:** JSON responses and strict decoding, UUID checks, opaque tokens and CSRF,
  Argon2id hashing, mail templates and SMTP.

The project code runs on `fileAccess` (one transaction bound to a signed-in, active account) and
registers its routes on the identity `HTTP` type, so it cannot move without a small exported seam.

## Target layout

| Package                          | Holds                                                                                                   |
| -------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `internal/httpjson`              | JSON responses, bounded strict request decoding, UUID check                                             |
| `internal/identity/passhash`     | Argon2id verifier and password rule                                                                     |
| `internal/identity/sessiontoken` | Opaque token, digest, CSRF value                                                                        |
| `internal/mailer`                | Mail templates and SMTP transport                                                                       |
| `internal/objectstore`           | Encrypted object files on disk                                                                          |
| `internal/oparchive`             | Operational archive key expiry                                                                          |
| `internal/testdb`                | Disposable migrated database for Postgres tests                                                         |
| `internal/identity`              | Accounts, sessions, policy, lifecycle links, admin, bootstrap, mail outbox, auth routes and route guard |
| `internal/projects`              | Hosted files, revisions, checkpoints, hosting, owners, sharing, account and project deletion, purge     |

Sharing and deletion stay inside `projects` for now: invitations, original-key rotation, account
deletion and purge call each other and share `fileAccess`. Splitting them further needs an
interface boundary, which would be a design change rather than a move.

## Move order (one commit each)

1. This plan.
2. `httpjson` leaf.
3. `passhash` leaf (named so it does not shadow `password` parameters).
4. `sessiontoken` leaf.
5. `mailer` leaf.
6. `objectstore` leaf.
7. `oparchive` (worker call in `cmd/calirestore` changes to the new package).
8. `testdb` helper (tests only).
9. `projects`: move the hosted-project, sharing and deletion files and their tests. `identity`
   exports the seam they need (errors, `Failure`, session lookup, recent-credential check,
   mutation lock, mail enqueue, password check for recovery, the route guard, cookie helpers).
   `cmd/calirestore` builds a `projects.Service` and registers both route sets.

## What does not change

- Every route path, guard (Origin, Sec-Fetch-Site, CSRF, 10 s timeout) and response.
- Deletion routes stay registered even without object storage, as today; file routes only with it.
- SQL text, advisory lock ids and their order, transaction boundaries.
- Test bodies, apart from package names, identifiers and helper calls that moved.
