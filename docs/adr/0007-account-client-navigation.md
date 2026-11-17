# 0007 · Account pages use client-side navigation

Status: Accepted · Date: 2026-11-17 · Decided by: owner · Source: issue #45 · Supersedes the account-navigation exception in [ADR 0006](0006-router-and-app-context.md)

## Context

The shared router already knows the account URLs, but account links and successful sign-in loaded a new document. This mixed two navigation lifecycles and left account state tied to the entry URL.

## Decision

Use the existing router for account, app and offline-shelf links, including sign-in returns and browser Back/Forward. Preserve the current URLs, protected deep links and allowlisted `?next=` destinations. Ordinary same-origin app links use history navigation; modified clicks, downloads, external links and other browser targets keep native behavior.

## Consequences

- Recheck the server session and capabilities on account destination changes before mounting protected content. A failed check closes access; project subroutes keep their mounted workspace.
- Reset page-local messages, forms and credential-confirmation controls on navigation. Security pages refresh their session list on every entry. Vault components close on unmount, keeping unlocks scoped to their page.
- Consume email-link fragments on entry and remove them from history. Leaving the page discards its token; Back must not restore it.
- Cookies, CSRF, reauthentication enforcement, session revocation, server authorization, CSP and offline caching policy remain unchanged. The offline shelf still mounts without an account API dependency.
- Browser regressions must prove that the document survives account navigation, deep-link sign-in and Back/Forward, and that expired sessions cannot reopen protected content.

## Alternatives considered

- Keep full document loads: rejected by the owner because account pages should navigate like the rest of the app.
- Add another routing library: the existing route table and history controller already cover these URLs.
