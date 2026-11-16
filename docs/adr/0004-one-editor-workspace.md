# 0004 · One surface editor: `EditorWorkspace`

Status: Accepted · Date: 2026-11-14 (planned), 2026-11-15 (done) · Decided by: owner, accepting the [editor convergence](../plan/editor-convergence.md) and [retire the adapter](../plan/editor-retire-adapter.md) plans · Source: [quality baseline](../reviews/2026-11-14-quality-baseline.md), Phase 1

## Context

The 2026-11-14 quality baseline found two editors. Storybook showed the designed `EditorWorkspace` shell, which owned its own sample state, while the app shipped the form-driven `DrawingReviewAdapter`. Design work done in Storybook never reached users, and both had to be maintained and tested.

## Decision

`src/ui/editor/editor-workspace/EditorWorkspace.tsx` is the only surface editor shell. It is a controlled component that holds no signals: layers, tool, history, save state and copy are props, and the canvas and panels are slots. The app drives it from the real drawing model (`DrawingWorkspace`); Storybook drives the same component with synthetic data through `src/stories/EditorReviewAdapter.tsx`. `DrawingReviewAdapter` was deleted (`3de6852`).

## Consequences

- A Storybook change to the shell is a change to the shipped editor.
- A parity test (`725b90c`) checks that every registered `surface.draw.*` control is reachable in the workspace.
- Keyboard and assistive-technology entry lives inside the workspace ("Enter by number"), not in a fallback editor.
- Photo review and checkpoint review are not on `EditorWorkspace` yet; moving them is roadmap work, not a second editor.

## Alternatives considered

- Restyle `DrawingReviewAdapter` to look like the Storybook editor: less code at the time, but two components to maintain and Storybook still showing something users never get.
- Keep the adapter as a fallback editor: it had already drifted behind the workspace in zoom, fit and layer reveal.
