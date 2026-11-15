---
name: session-ritual
description: Start and end of every CaliRestore Pro working session or turn — read the handoff, reconcile git, then at the end evaluate the session, log process notes, update the handoff and suggest the next prompt. Use at the start of a session and before closing any turn that changed files or ran commands.
---

# Session ritual

Living skill: edit, split or replace it whenever the process changes. Record why in
`docs/handoff/process-notes.md`.

## Start

1. The repo is `cali-restore-pro/` inside `C:\Users\sicza95\Projects\CaliRestore` (the parent is
   not a git repo). Run git from the repo.
2. Read `docs/handoff/README.md`, then the plan or review it points to.
3. Compare `git status -sb` and `git log --oneline -5` with the handoff. Trust git; note any drift.
4. Skim the open items in `docs/handoff/process-notes.md`. They are known traps.

## End of every turn

1. **Handoff** — add a dated log entry at the top of the Log in `docs/handoff/README.md`: what
   changed, what was verified (suites and result), what was not run, open questions. Keep the
   "Next step" line current.
2. **Process notes** — add a row to `docs/handoff/process-notes.md` for every issue in our way of
   working or fact learned (tool limits, permission blocks, test traps, environment quirks). Close
   rows that got resolved.
3. **Session evaluation** — in the reply, a short block: what went well, what cost time, what to
   change next time. Turn repeat lessons into a skill edit.
4. **Skills** — if a procedure was done twice or a trap was hit, create or update a skill in
   `.claude/skills/`. Supersede or delete stale ones; never leave two that disagree.
5. **Commit command** — if files changed and nothing was committed, give the owner the exact
   signed commit command (see the `signed-commit` skill).
6. **Suggested next prompt** — end the reply with one the owner can paste.
