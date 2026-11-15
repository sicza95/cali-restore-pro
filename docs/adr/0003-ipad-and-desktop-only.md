# 0003 · iPad and desktop only; phones are not a target

Status: Accepted · Date: 2026-11-15 · Decided by: owner · Source: handoff log ("Step 4 merged, phone width dropped", commit `e1b065e`) and the [quality baseline](../reviews/2026-11-14-quality-baseline.md), Phase 2

## Context

`AGENTS.md` makes iPad the first target: 1194 × 834 landscape and 834 × 1194 portrait, tools on the left, portrait inspectors docked below the canvas. Earlier work also checked a 390 px phone width; the [editor convergence plan](../plan/editor-convergence.md) kept it "working but not designed for", and the canvas-first step still added a phone dock for the tool chip (`08d0c58`). Phase 2 then had to decide whether its layout items include phones.

## Decision

Support iPad in both orientations and desktop browsers. Phone widths are not supported for now, and no roadmap item adds phone layouts.

## Consequences

- Layout and screenshot review covers 1194 × 834, 834 × 1194 and desktop widths.
- The 390 px checks and screenshots are removed from the platform tests (owner decision, 2026-11-15, issue #47). The phone-width CSS (for example the docked tool chip at 640 px and below) is no longer tested.
- Touch targets stay at least 44 px, because iPad is a touch and Pencil device.

## Alternatives considered

- Keep designing for phones as well: every layout item would need a third layout and screenshot set.
