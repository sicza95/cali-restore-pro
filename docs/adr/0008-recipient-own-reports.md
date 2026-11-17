# 0008 · Recipients author their own report copies

Status: Accepted · Date: 2026-11-17 · Decided by: maintainer · Source: issue #55 (M-16, PROJ-04/OUT-04 follow-up)

## Context

Recipients of a shared project can open the grants an owner sealed for them (assessment snapshot, estimate summary or full estimate, history), but could not write a report of their own. Content is encrypted on clients ([ADR 0002](0002-client-side-encryption.md)), grants are read-only snapshots and the server only relays envelopes, so any report a recipient writes has to be built and kept on their device.

## Decision

A recipient can author their own report, built only from content in their active grants' scopes, kept encrypted in the recipient's own vault on their device, never visible to the owner and not part of the owner's backups. It is always a draft, never a final or issued report, and its PDF and XLSX exports say "Recipient draft from shared content". When the grant is revoked, the recipient keeps the copy with a visible warning. No server, API or migration change.

In code: drafts live in the `encrypted-recipient-reports` IndexedDB table (vault database version 9) under `[account, project, invitation]`, sealed with a purpose bound to project, invitation and revision (`src/platform/vault/recipient-reports.ts`). `authorRecipientReport` (`src/platform/recipient-reports/scope.ts`) drops whatever the grant does not allow: no estimate data without an estimate grant, a summary at most from a summary grant, and only the chosen level is stored.

## Consequences

- An assessment-only recipient's report holds no estimate figures. A full-estimate recipient who chooses the summary stores only the totals.
- The owner's report, estimate and project tables, and therefore portable backups, never read recipient drafts. The recipient's copy is not synced, backed up or recovered elsewhere; losing the device or vault loses it.
- A stored copy does not follow later grant changes: the next save re-filters it against the grant active then, and a revoked grant leaves the last saved copy, read-only apart from export and delete.
- Tests must keep proving the scope filter (`scope.test.ts`), the separate keyed storage (`recipient-reports.test.ts`) and the owner/recipient flow (`tests-platform/recipient-reports.browser.ts`).

## Alternatives considered

- Store recipient drafts in the owner's report table under the project id: one key per project would collide with a co-owner's own draft and would let backups pick them up.
- Server-hosted recipient reports: would need API and storage changes and server-visible ownership of derived content, which the decision rules out.
- Delete the copy on revocation: the owner chose that the recipient keeps what was lawfully shared, with a warning.
