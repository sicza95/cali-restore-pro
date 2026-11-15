---
name: signed-commit
description: Commit, push and merge in CaliRestore Pro so every commit is GPG-signed and Verified on GitHub. Use whenever committing, pushing, branching for a step, or merging a PR in this repo.
---

# Signed commits

Living skill: edit it when a rule or permission changes, and note why in
`docs/handoff/process-notes.md`.

## Commit (Claude Code on the owner's Windows machine)

```powershell
git add <files>
git commit -S -m "<type>(<scope>): <summary>" -m "<body>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git log --show-signature -1
```

- `commit.gpgsign=true` is set; the key is the owner's and only lives on this machine.
- Run `npx prettier --write` on changed docs first; `npm run check` includes `format:check`.
- In the Linux VM: never commit; hand the owner the command block instead.

## Push

- `AGENTS.md` says push straight to `main`, but in auto mode the permission classifier **blocks
  `git push` to `main`** unless the owner asked for a push in that message. If blocked, don't
  retry: give the owner the push command, or ask them to allow it.
- After any push, confirm: `gh api repos/sicza95/cali-restore-pro/commits/<sha> --jq .commit.verification.verified`.

## Steps that change shipped screens

- One short-lived branch per step (`feat/<step-slug>`), one PR with screenshots.
- The plan doc and handoff for the step land on `main` first.
- Merge by fast-forwarding `main` to the PR head (not GitHub squash or rebase), so the signatures
  survive. Check every commit shows Verified before merging.

## PR screenshots

`gh` and the GitHub MCP can't upload images (GitHub has no API for PR attachments), and
screenshots never go on `main` or the step branch. Put them on a signed orphan branch without
touching the working tree, then embed them with `blob/…?raw=true` URLs (these work for a private
repo when the viewer is signed in):

```bash
S=../.analysis/claude-tmp/<step>-shots   # copy PNGs out of test-results first
tree=$(for f in $S/*.png; do printf '100644 blob %s\t%s\n' "$(git hash-object -w "$f")" "$(basename "$f")"; done | git mktree)
c=$(git commit-tree -S "$tree" -m "chore: <step> PR screenshots")
git push origin "$c:refs/heads/pr-assets/<step>"
```

`![1194 closed](https://github.com/sicza95/cali-restore-pro/blob/pr-assets/<step>/drawing-1194-closed.png?raw=true)`.
Delete the branch after the PR merges.
