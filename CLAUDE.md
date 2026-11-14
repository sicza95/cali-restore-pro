# Claude working notes

@AGENTS.md

`AGENTS.md` is the shared rulebook for every agent (Codex and Claude). This file adds only what is specific to Claude sessions. If the two ever disagree, `AGENTS.md` wins.

## Start of every session

1. Read [`docs/handoff/README.md`](docs/handoff/README.md). It is the single source of "where are we, what is next".
2. Check `git log --oneline -10` and `git status` against the handoff. If they disagree, trust git and note it in the handoff.
3. Read the milestone or review document the handoff points to before changing code.

## End of every turn

1. Update `docs/handoff/README.md`: what changed, what was verified (and what was not), open questions, next step.
2. If code or docs changed, give the owner the exact commit command (see signing below).
3. Finish the reply with a **Suggested next prompt** the owner can paste to continue.

## Commit signing

Every commit must be GPG-signed and show as Verified on GitHub. The signing key lives only on the owner's Windows machine, so Claude does **not** run `git add`, `git commit` or `git push` from its Linux environment (it has no key, and git write operations there can leave stale `.lock` files on the shared folder).

Instead Claude:

- writes the changes into the working tree,
- lists the files changed, and
- gives a ready-to-run command for the owner, for example:

```powershell
git add CLAUDE.md docs/handoff/README.md
git commit -S -m "docs: add Claude handoff" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
git log --show-signature -1
git push
```

Group work into coherent conventional commits; when one turn produces several, give one command block per commit in order.

## Environment notes

- Claude reaches the repo through a Linux VM mount of `C:\Users\sicza95\Projects\CaliRestore`. That VM has Node 22 (repo pins 24), no Docker and no Go, so `npm run typecheck` and `npm run lint` work there, but Go tests, the Compose stack and Playwright suites must be run by the owner (or by Codex) on Windows.
- Visual review: Claude can render `storybook-static/` and read Playwright screenshots under `test-results/`. Note their timestamp; they may predate the latest commit.
- Scratch files go in `../.analysis/claude-tmp/` (outside the repo), never in the repo.

## Working standards (in addition to AGENTS.md)

- Prefer small, reviewable steps that keep `npm run check` green.
- Record rating-relevant improvements against [the quality baseline](docs/reviews/2026-11-14-quality-baseline.md) roadmap by ticking items there.
- Don't commit generated screenshots, secrets, `.analysis/` content or real project photos.
