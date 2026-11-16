# 0001 · Go service and PostgreSQL behind a SolidJS client

Status: Accepted · Date: 2026-11-04 · Decided by: owner, accepting the [architecture proposal](../plan/architecture.md) in M-PLAN (PR #2) · Implemented in [M-00](../milestones/m00-verification.md)

## Context

The repository started as a SolidJS/TypeScript UI library with no backend. The platform plan needs revocable sessions, transactional access policy, quota reservations, conditional revisions, durable mail jobs and streaming ciphertext transfer. The owner opened the backend choice explicitly.

## Decision

Keep SolidJS, TypeScript, Vite, semantic CSS and Storybook for the client. The backend is one Go binary (`server/cmd/calirestore`) on `net/http` and PostgreSQL through `pgx`, with ordered SQL migrations in `server/migrations/` and an OpenAPI contract (`contracts/openapi.json`) that generates the TypeScript client. Ciphertext bytes live on a private volume, not in database rows. Docker Compose runs the app, the worker (same image, different command), one-shot migrations and PostgreSQL.

## Consequences

- Node is a build tool only, never a production server dependency.
- Jobs and the mail outbox are PostgreSQL leases; no Redis, Kafka, Kubernetes or mandatory S3 until a measured need.
- Two languages to maintain; Go tests run in Docker and in CI.
- The choice is a maintainability and deployment decision, not a measured performance claim.

## Alternatives considered

- Keep Node: less language switching, but there was no backend to migrate and the owner opened the decision.
- ASP.NET Core: larger integrated identity ecosystem, but a different framework and tooling commitment.
- Rust: kept as a candidate for later client/WASM geometry or decoding where measured work justifies it, not for account CRUD.
