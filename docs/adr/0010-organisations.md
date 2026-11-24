# 0010 · Projects belong to organisations

Status: Accepted · Date: 2026-11-24 · Decided by: owner · Source: owner request 2026-11-24 and the multi-user E2EE v2 design draft, §8.4–8.5 (organisations and permission sets)

## Context

Restoration work is done by companies, and a company has to keep its projects when someone leaves. Until now a project belonged to the account that created it, with co-owners added one project at a time. The multi-user E2EE v2 plan (§8.5) decided that every project belongs to an organisation, each account has a personal organisation of one, org admins see everything, and members get access through groups (§8.4: none, view or edit for each part of a project, plus a list of allowed actions). That plan's encryption is not built yet, and client-side encryption is switched off for the UX phase.

## Decision

Organisations come in now, as plain server records, so the screens and the way people work can be shaped before E2EE v2 arrives.

- Every account has a personal organisation (created with the account; migration 0030 adds one for existing accounts). It has no name of its own (the app calls it "Personal"), cannot be renamed, deleted or shared.
- A shared organisation has admins and members. Its creator is its first admin; it always keeps at least one admin. Admins rename and delete it, invite and remove people, change roles and groups, and edit groups. Anyone may leave.
- A group is a named permission set: none, read or write for each of the nine project sections of plan §8.4, a list of actions (`members.manage`, `project.settings`, `estimate.publish`, `photos.delete`, `project.export`) and an "every project" switch. The quote summary is never written directly, and whoever reads pricing also reads it. New organisations start with the starter groups of the plan, in the creator's language.
- Invitations name an email address, not an account, and the answer is the same whether or not the address is registered (unlike project invitations). An existing account gets an email; an address that signs up later finds the invitation on its Organisations page. Invitations last 14 days.
- A project records its organisation in its document (`organisation`), and a synced project on the server (`hosted_projects.organisation_id`). Hosting names the project's organisation, which the host must belong to; without one it goes to the host's personal organisation. An organisation with synced projects cannot be deleted.
- The top bar shows the current organisation as a link that opens a menu of the account's organisations. The project list shows the projects of that organisation; a project of an organisation the account left, or of one that no longer exists, shows under Personal. The list of organisations is kept in the browser, so the project list keeps working offline.
- Changes reach other people at once: each organisation change queues a notice with `pg_notify` in its own transaction (sent only if it commits), every API process listens on one connection, and browsers receive notices over Server-Sent Events (`GET /api/v1/events`). A notice names what happened (invited, joined, declined, left, removed, deleted, or just "changed") and carries no content; the app then re-reads through the normal API and shows a toast. Server-Sent Events were chosen over WebSockets because the browser only listens, they need no new library, and the browser reconnects by itself; after a reconnect the app re-reads everything, since notices sent meanwhile are not replayed.

## Consequences

- Groups are stored and edited, but nothing reads them yet: being in an organisation or a group gives no access to its projects. Projects are still shared one at a time with project invitations and co-owners. Org-wide access (admins in every project, groups applied per section) arrives with E2EE v2, which needs a key holder to wrap section keys (plan §8.5) and replaces these plain records with the signed org log.
- The server sees organisation names, members and groups in clear. Under E2EE v2 the names move under the directory key; the server keeps only what it needs to route and check signatures.
- A project moves between organisations only by being created in the right one; moving an existing project is a later step.

## Alternatives considered

- Wait for E2EE v2 and build organisations once: rejected by the owner; the screens and the permission model need real use first.
- Simple roles (owner, admin, member) instead of groups: rejected by the owner in favour of the plan's permission sets.
- UI only, with local mock data: rejected by the owner; invitations need a server.
