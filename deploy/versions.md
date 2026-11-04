# M-00 toolchain and dependency review

Resolved 4 November 2026. Exact image index digests are checked into `Dockerfile`, `compose.yaml` and the isolated test overlay. Multi-architecture image indexes support amd64/arm64; actual boot evidence is Linux amd64 on Docker Desktop 4.97.0 / Engine 29.9.2 / Compose 5.6.1.

| Component                            | Pin                                               | License / purpose                                                                                    |
| ------------------------------------ | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Go                                   | 1.27.3, official Bookworm builder image           | BSD-3-Clause; compiled net/http app, worker and migration command                                    |
| PostgreSQL                           | 18.6 Bookworm                                     | PostgreSQL License; transactional operational metadata                                               |
| Node                                 | 24.22.2 Bookworm slim                             | Node MIT plus bundled notices; build stage only, same version as `.nvmrc`                            |
| Distroless static                    | Debian 13 nonroot, immutable digest               | Apache-2.0 project plus Debian/package notices; CA certificates, non-root runtime without shell/Node |
| pgx/v5                               | 5.11.0                                            | MIT; PostgreSQL pool/driver, the only direct runtime Go module                                       |
| pgpassfile, pgservicefile, puddle/v2 | Checksummed in `server/go.mod` / `go.sum`         | MIT; pgx transitive dependencies                                                                     |
| x/text / x/sync                      | 0.41.0 / 0.22.0                                   | BSD-3-Clause; pgx transitive modules; x/text upgraded after the vulnerability scan                   |
| Mailpit                              | 1.29.4                                            | MIT; optional development mail sink                                                                  |
| Cloudflared                          | 2026.10.0                                         | Apache-2.0; optional operator-configured tunnel                                                      |
| @hey-api/openapi-ts                  | 0.99.0                                            | MIT; build-time type generation compatible with existing TypeScript 6                                |
| js-yaml                              | 4.3.2 scoped override in the generator dependency | MIT; fixes audited YAML parser advisories without changing Storybook's dependency resolution         |
| govulncheck                          | x/vuln 1.9.0                                      | BSD-3-Clause; CI/local tooling only                                                                  |

All pre-existing frontend versions remain pinned; the API generator is the only added frontend development dependency. Lockfiles and Go checksums record transitive versions. This is a license/maintenance review of direct additions and driver dependencies, not a claim that arbitrary future packages or deployment distributions are already cleared. Preserve bundled image/package notices when redistributing.

Primary references: [Go releases](https://go.dev/dl/), [PostgreSQL 18.6](https://www.postgresql.org/docs/release/18.6/), [pgx releases and license](https://github.com/jackc/pgx), [Hey API type generator](https://heyapi.dev/docs/openapi/typescript/plugins/typescript), [Distroless](https://github.com/GoogleContainerTools/distroless), [Mailpit](https://github.com/axllent/mailpit), [Cloudflared](https://github.com/cloudflare/cloudflared), [Go vulnerability tooling](https://go.dev/doc/security/vuln/).
