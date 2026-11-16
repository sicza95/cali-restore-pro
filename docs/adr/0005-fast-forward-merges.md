# 0005 · Merge pull requests by fast-forwarding `main`

Status: Accepted · Date: 2026-11-15 · Decided by: maintainer · Source: PRs #14, #15, #16 and #17, which were merged this way

## Context

`AGENTS.md` requires every commit to be GPG-signed and shown as Verified on GitHub, and only the maintainer holds the signing key. GitHub's squash and rebase merges create new commits that do not carry the maintainer's signature.

## Decision

Steps that change shipped screens go through a short-lived branch and a pull request. The PR is merged by fast-forwarding `main` to its head, not with GitHub's squash or rebase merge. Before the push, every commit on the branch shows Verified and CI passes.

## Consequences

- Every commit on `main` keeps the maintainer's signature, and history stays linear.
- GitHub marks the PR merged, but does not delete its head branch; that is cleaned up separately.
- A branch must be rebased onto the latest `main` and re-signed by the maintainer before it can fast-forward, so parallel PRs land one at a time.
- Plan docs for a step may still land on `main` directly as signed commits.

## Alternatives considered

- GitHub squash or rebase merge: the resulting commits lose the maintainer's signature.
