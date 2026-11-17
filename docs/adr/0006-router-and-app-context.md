# 0006 · One router and an app context

Status: Superseded in part by [0007](0007-account-client-navigation.md) (account navigation only) · Date: 2026-11-15 · Decided by: maintainer, under the quality roadmap · Source: [quality baseline Phase 3 item 2](../reviews/2026-11-14-quality-baseline.md), [plan](../plan/router-context.md)

## Context

Routes were parsed in three files, history was handled inside the project workspace, auth guards were inline JSX and every screen received the account model as a `model` prop, re-typed in three places. The app shell redesign (Phase 2 item 4) needs one place that knows every route and who may open it.

## Decision

`src/ui/router/` owns the typed route table, parsing, link builders, guards and history. `src/ui/app-context/` provides the account model and the router to every screen through `useApp()`; screens no longer take a `model` prop.

## Consequences

- A new URL is added to the route table first; the Vitest tests in `src/ui/router/` cover parsing, links, `?next=` and guards.
- Screens depend on `useApp()`, so they render only inside `AppProvider`. Storybook stories of such screens must wrap them in a provider with synthetic data.
- Account destinations stay full page loads for now; the shell redesign decides whether they move to `router.navigate`.

## Alternatives considered

- `@solidjs/router`: a new library with its own link and data conventions, for a route table of about twenty entries; not a concrete need yet.
- Keeping `model` props but typing them once: removes the duplicated types, not the coupling.
