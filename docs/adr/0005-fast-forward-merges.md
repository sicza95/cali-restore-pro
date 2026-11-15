# 0005 · Merge pull requests by fast-forwarding `main`

Status: Accepted · Date: 2026-11-15 · Decided by: owner · Source: the [`signed-commit` skill](../../.claude/skills/signed-commit/SKILL.md) and the handoff log (PRs #14, #15, #16 and #17 were merged this way)

## Context

`AGENTS.md` requires every commit to be GPG-signed and shown as Verified on GitHub, and the signing key exists only on the owner's Windows machine. GitHub's squash and rebase merges create new commits that do not carry the owner's signature.

## Decision

Steps that change shipped screens go through a short-lived branch and a pull request. The PR is merged by fast-forwarding `main` to its head, not with GitHub's squash or rebase merge. Before the push, every commit on the branch shows Verified and CI passes.

## Consequences

- Every commit on `main` keeps the owner's signature, and history stays linear.
- GitHub marks the PR merged, but does not delete its head branch; that is cleaned up separately.
- A branch must be rebased onto the latest `main` and re-signed on the owner's machine before it can fast-forward, so parallel PRs land one at a time.
- Plan docs and the handoff for a step may still land on `main` directly as signed commits.

## Alternatives considered

- GitHub squash or rebase merge: the resulting commits lose the owner's signature.
