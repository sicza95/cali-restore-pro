# Architecture decision records

One short file per decision that shapes the code or the way we work and would be expensive to reverse. The [architecture overview](../architecture.md) links the accepted ones in context.

- Copy [the template](0000-template.md) to `NNNN-short-title.md` with the next free number.
- Record decisions that were actually made, with the date, who made them and where the evidence lives (plan doc, review, commit). Proposals live in `docs/plan/` until accepted.
- Do not rewrite an accepted ADR's decision. To change it, add a new ADR that supersedes it and set the old one's status to `Superseded by NNNN`.

| ADR                                       | Decision                                                       | Status                    |
| ----------------------------------------- | -------------------------------------------------------------- | ------------------------- |
| [0001](0001-go-postgresql-backend.md)     | Go service and PostgreSQL behind a SolidJS client              | Accepted                  |
| [0002](0002-client-side-encryption.md)    | Content, including project names, is encrypted on clients      | Accepted                  |
| [0003](0003-ipad-and-desktop-only.md)     | iPad and desktop only; phones are not a target                 | Accepted                  |
| [0004](0004-one-editor-workspace.md)      | One surface editor: `EditorWorkspace`                          | Accepted                  |
| [0005](0005-fast-forward-merges.md)       | Merge pull requests by fast-forwarding `main`                  | Accepted                  |
| [0006](0006-router-and-app-context.md)    | One router module and an app context instead of `model` props  | Partly superseded by 0007 |
| [0007](0007-account-client-navigation.md) | Account pages use client-side navigation                       | Accepted                  |
| [0008](0008-recipient-own-reports.md)     | Recipients author their own report copies, kept in their vault | Accepted                  |
| [0009](0009-passkey-sign-in-factor.md)    | Passkeys are an optional sign-in factor only                   | Accepted                  |
| [0010](0010-organisations.md)             | Projects belong to organisations                               | Accepted                  |
