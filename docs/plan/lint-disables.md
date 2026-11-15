# File-level lint disables — Phase 3, item 6 (second half)

15 November 2026 · Status: done · Issue: #32 · Source: [quality baseline](../reviews/2026-11-14-quality-baseline.md), Phase 3 item 6 and code finding 5

Goal: no file-level `eslint-disable` in `src`, so `solid/reactivity` sees every component again. No behaviour change.

## Where things stand

Eleven files start with `/* eslint-disable solid/reactivity */`: `ProjectBackup`, `ProjectDetail`, `ProjectKeyTransfer`, `ProjectOriginals`, `ProjectSync`, `ProjectWorkspace` and five in `sharing/`. With the comments removed the rule reports 37 findings of three kinds (two of the 37 were already line-disabled elsewhere):

| Kind                                                                                                        | Count | What it is                                                                                                                      |
| ----------------------------------------------------------------------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------- |
| A function with reactive reads passed to `props.run(…)` / `props.onRun(…)` / `run(…)`                       | 27    | Deferred commands started by a click or submit. They should read the props current when they run, and do.                       |
| A prop read once at setup (`props.projectId`, `props.invitation`, `props.item.*`, `props.model.account`, …) | 8     | Values fixed for the mount: the parent keys the panel (`<Show keyed>`, `<For>` rows), or the value is a draft's starting point. |
| Callbacks nested inside a command, and a sort comparator in a derived list                                  | 4     | Reads that belong at the start of the command or the derivation.                                                                |

## Approach

1. **Deferred commands**: configure `solid/reactivity` with `customReactiveFunctions: ['run', 'onRun']` in `eslint.config.js`, with a comment. That is the codebase's convention for commands, stated once instead of 27 line disables.
2. **Fixed-for-mount reads**: wrap in `untrack(() => …)` with a one-line comment naming why the value can't change (keyed parent, `<For>` row, or draft start). I checked each parent.
3. **Nested callbacks and the comparator**: read the props into locals at the start of the command or derivation.
4. Two line disables in `SurfaceWorkspace.tsx` become unused and go; the third (a callback to `recovery.save`) stays, with its reason.

## Verification

`npm run check` (lint with `--max-warnings 0`), `test:unit`, `npm test`, `test:files`, `test:sync`, `test:app` (invitations and sharing), `build-storybook`.

## Outcome

- No file-level `eslint-disable` in `src`. Three line-level disables remain, each with its reason: two `no-control-regex` in report exports (XML and spreadsheet sanitising) and one `solid/reactivity` for the `recovery.save` callback in `SurfaceWorkspace.tsx`.
- `eslint.config.js` sets `customReactiveFunctions: ['run', 'onRun']`; eight setup reads use `untrack` with a comment; four nested reads moved to locals.
- No behaviour change found: every suite passed (`check`, `test:unit` 210, `npm test` 16, `test:files` 22, `test:estimates` 8, `test:sync` 2, `test:app` 16 + 1 skipped, `build-storybook`).
