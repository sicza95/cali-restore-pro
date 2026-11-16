# Estimate as summary and steps

Phase 2 item 3 of the [quality baseline](../reviews/2026-11-14-quality-baseline.md) roadmap, answering UX finding 4 ("everything is visible at once"). The estimate screen is one long page: at 1194 × 834 it is about 2,600 px tall with phases, presets, objects, results, versions, extras and adjustments all open at once, and two equal buttons (save, issue) half-way down a side column.

## Goal

Summary first, then one step at a time. Each step has one primary action. Works on iPad landscape (1194), iPad portrait (834) and desktop. No change to the calculation, persistence, routing or how the project reaches the screen; content is moved, not rewritten.

## Wireframe

```
┌ Estimate ─────────────────────────────────────────────────────────┐
│ Summary                                                           │
│  Final total  HUF 630        Labour hours 15 · Subtotal · Before  │
│  Version 1 · Issued · 15 Nov 2026, 14:03       tax · Tax          │
│  status line (saved / failed)                                     │
├───────────────────────────────────────────────────────────────────┤
│ [1 Objects ][2 Work phases][3 Extras ][4 Adjustments][5 Save and  │
│  Whole proj.  2 phases      None        and tax       issue       │
│                             Incomplete  None          Version 1 ] │
├───────────────────────────────────────────────────────────────────┤
│ Step heading (receives focus when the step changes)               │
│ … the existing panel(s) for this step …                           │
│                                    [Back]  [Next: Work phases ▸]  │
└───────────────────────────────────────────────────────────────────┘
```

- **Summary** (always visible): final total, hours, subtotal, before tax and tax (the same `data-estimate-result` cells as today), the latest saved version in words, and the save status line.
- **Step navigation**: an ordered list of five buttons in a labelled `nav`; the current one has `aria-current="step"`. Each shows its number, name and a short state (object count, phase count, extras count, adjustments and tax, latest version). A step whose fields block saving says "Incomplete". At least 44 px tall, wraps on narrow widths.
- **Steps** (one panel visible, all stay mounted so drafts and selections survive switching):
  1. Objects in this estimate: currency, whole project or selected objects.
  2. Work phases: the phase editor and private presets side by side (today's layout), archived phases.
  3. Extras.
  4. Adjustments and tax.
  5. Save and issue: assumptions, the validation note, "Save estimate version" (primary), "Issue estimate" (secondary), saved versions.
- **Footer per step**: Back (secondary) and "Next: <step>" (primary); the last step's primary is "Save estimate version". Moving to a step moves focus to its heading so screen readers announce it.
- The currency-change alert stays above the summary; the backup gap message stays on the backup panel.

## Copy

New strings in EN and HU in `src/platform/estimates/copy.ts`, following the [copy glossary](../copy-glossary.md): step names, "Estimate steps" (nav label), "Summary", "Back", "Next: …", "Incomplete", counts. Numbers use the shared formatter (`src/platform/format/number.ts`).

## Tests

`estimates.browser.ts`, `project-reviews.browser.ts` and `measured-reports.browser.ts` open the step they act in (by `data-control-id="estimate.step.<key>"`), then keep their assertions. They keep the 1194 / 834 screenshots, the overflow and 44 px checks, axe and the copy guard.

## Before

Screenshots (1194, 834) are on the PR's `pr-assets/estimate-steps` branch, not in the repository.
