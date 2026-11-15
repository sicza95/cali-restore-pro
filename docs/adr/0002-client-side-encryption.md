# 0002 · Content, including project names, is encrypted on clients

Status: Accepted · Date: 2026-11-04 · Decided by: owner, accepting the [access and encryption contract](../plan/access-and-encryption.md) in M-PLAN ([PR #2](https://github.com/sicza95/cali-restore-pro/pull/2)) · Implemented from [M-03](../milestones/m03-client-vault.md) onward

## Context

Restoration projects hold photos, measurements, notes and prices. The hosted service must authorize, store and sync them, and its backups, staging and logs must not widen who can read them.

## Decision

Clients encrypt images, filenames and metadata, project, object and surface names, masks, geometry, calibration, notes, thumbnails, checkpoints, reports and all estimate content before upload. Content and recipient keys stay on authorized clients; infrastructure secrets cannot unwrap project content. The server sees only account and routing identities, opaque resource, revision and grant ids, memberships and scopes, public keys and encrypted envelopes, key epochs, byte counts and operational timestamps. The schema has no plaintext `objects`, `surfaces` or searchable project-name columns.

## Consequences

- The server knows projects only by id. The hosted trash, for example, shows a project's name only when this device's vault still holds it, and "Deleted project N" otherwise (`53567b2`).
- Names, search and previews come from the local vault.
- The server cannot scan uploads for viruses; file type and metadata checks happen on the client.
- Mail never contains project names, photos, notes or estimate content.

## Alternatives considered

- Plaintext names or hierarchy columns for convenience: ruled out by the [architecture](../plan/architecture.md) ("do not add plaintext `objects`, `surfaces` or searchable project-name columns").
