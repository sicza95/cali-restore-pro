# Visible reasons in the drawing workspace

16 November 2026 · Status: done · Issue: #81 · Found while doing [the visible reason for blocked originals](visible-reason.md) (#79)

Goal: on the surface page in drawing mode, every blocked control says why without hovering, in EN and HU, both themes, at 1194 × 834 and 834 × 1194, using the #79 pattern: visible text, the control's `aria-describedby` pointing at it, no `title` repeating it.

## Where things stood

On `main` at `972009c`:

- **Layer "Remove"** (`DrawingLayers.tsx`) was disabled with its reason (`removeHelp` for the master mask and folders with children, `removeDraft` while the layer has a draft) only as a `title`.
- **"Export"** in the editor header: the app's drawing workspace passes no `onExport`, so it was always disabled, with `exportUnavailable` only as a `title`.
- **Blocked tools in the rail** (`ToolRail.tsx`) had their reason as a visually hidden span (the accessible description) and the `title`. Tapping one did nothing visible; the tool chip showed a reason only for the active tool.

## Approach

Owner default: the embedded editor hides Export instead of showing it disabled with a reason.

1. **Remove.** Its reason is a `field-help` paragraph under the layer actions, and Remove's `aria-describedby` points at it; the `title` is gone. A new `.drawing-reason` rule gives it muted 14 px text with no margin, so it does not rely on the app's global `field-help` style.
2. **Export.** `EditorWorkspace` leaves Export out when it has no `onExport` and no `title` (embedded). A titled editor without output, as in the stories, still shows it disabled.
3. **Tool rail.** `ToolRail` gets an optional `onBlocked(tool)`, passed on by `EditorWorkspace` as `onBlockedTool`. The drawing workspace remembers the blocked tool last tapped, and the tool chip shows "<tool>: <reason>" in place of the tool options until a usable tool is chosen or the user presses outside the rail. The rail is a scrolling column, so a bubble beside a button would be clipped; the chip is on screen at both sizes. The hidden span stays the button's accessible description, so it is read before any tap; the button's `title` is now always its name and shortcut. The state lives in the drawing workspace, since the editor shell holds none.
4. **Copy.** No new strings: existing EN and HU keys, the chip joining the tool's name and its reason with ": ".

Not changed: the LayerPanel "Calibration" and PhotoCanvas import, which the issue lists as Storybook or library only.

## Outcome

- As planned. The browser checks are in `tests-platform/drawing-reasons.ts`, called at the start of `verifyDrawingInput` in the projects flow (`projects.browser.ts` stays at 399 lines). In EN and HU at 1194 and 834 they check that the embedded editor has no Export; that Remove on the master mask is disabled, has no `title`, is described by its visible reason and that the reason is not clipped; that "Edit points" (no paths yet) is described by its reason, shows it unclipped in the tool chip when tapped, and clears it when Navigate is chosen. Axe runs on the tool chip and the layer properties in light and dark. Remove's draft reason is checked in `verifyDrawingInput` while a mark is pending.
- Verified: `check`, `test:unit` 239, `npm test` 18, `test:files` 32, `build-storybook`, and the projects flow on its own. Not run: the new assertions against the old code, the flow with `--repeat-each`, `test:app`, `test:sync`, `test:estimates`.
