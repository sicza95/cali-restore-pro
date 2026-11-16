# Estimate rows without truncation

16 November 2026 · Status: done · Issue: #35 · Source: [quality baseline re-score](../reviews/2026-11-14-quality-baseline.md#re-score-after-phases-1-to-4), UI "truncated field rows"

Goal: every select and number field on the estimate's Work phases step shows its whole value at 1194 × 834 and 834 × 1194, in English and Hungarian, with long object, surface and phase names and large numbers. iPad and desktop only ([ADR 0003](../adr/0003-ipad-and-desktop-only.md)).

## Where things stand

Measured on `main` at `6b4fc02` with object "North elevation sandstone balustrade", surface "Lower cornice and frieze, west bay", phase "Consolidation and cleaning of the weathered stone", 123456.75 h, 987654.5 HUF/h and 12345678.25 HUF of materials. Room is the select's width less its padding and chevron.

| Screen     | Field (shown value)                                |  Needs |  Room |
| ---------- | -------------------------------------------------- | -----: | ----: |
| EN 1194    | Phase surface (object / surface)                   |  489px | 100px |
| EN 1194    | Phase assessment version ("Current assessment")    |  134px | 100px |
| EN 1194    | Phase layer ("No mask assigned")                   |  120px | 100px |
| EN 1194    | Measurement status ("Area unavailable")            |  109px | 100px |
| HU 1194    | the same four ("Nincs hozzárendelt maszk": 171 px) | ≤489px | 100px |
| EN, HU 834 | Phase surface                                      |  489px | 182px |

The number fields fit. At 1194 the step is a two-column grid (`review-grid`, 3fr / 2fr): the phase form gets about 520 px and the private presets panel beside it about 350 px, mostly empty. Inside the form, `review-fields` packs three 9rem columns, so each select has about 100 px for text.

## Approach

1. **One column for the step**: on the estimate, the presets panel follows the phase form instead of sitting beside it (it belongs to the rate and productivity fields at the form's end), so the form gets the step's full width at 1194, as it already does at 834.
2. **Wider field columns on the estimate**: `review-fields` columns start at 13rem there instead of 9rem, so the short values above fit in both languages.
3. **The surface gets its own row**: the phase surface select spans the row; assessment version and phase layer share the next one.
4. **The full name is always readable**: object and surface names can be 120 characters each, more than any select can show. The link under the phase area, which said "Phase surface" again, names the surface: "Open surface: Object / Surface" (HU "Felület megnyitása: …"), and wraps.

All of it is CSS in `src/ui/project-review/styles.css` scoped to `.estimate-review`, a `class` prop on `ReviewSelect` for the wide fields, and one catalogue string. The shared `review-fields` rule (`src/ui/editor/checkpoint-review/styles.css`) is not changed.

## Verification

New `tests-platform/estimate-rows.browser.ts` (in `test:files`): it renames the object and surface to the long names, fills the large numbers, and on the Work phases step at both sizes in EN and HU measures each visible select's and input's shown text against its room (canvas `measureText` with the field's font), checks 44 px targets, no horizontal page scroll and task language, and saves a screenshot. It fails on `main` (the table above is its output). Then `npm run check`, `test:unit`, `npm test`, `test:files`, `test:estimates`, `build-storybook`, and the four screenshots.

## Outcome

- Commits: `fix(estimates): give phase and extra fields room for whole values` (steps 1 to 3), `fix(estimates): name the phase surface in its link` (step 4), `fix(estimates): keep summary amounts whole`, and the test.
- Every value in the table above now shows whole, in both languages and at both sizes.
- Two things found on the way, both fixed here:
  - The Extras step had the same problem: with a long object name, "Applies to" had 106 px (1194) and 120 px (834) for a 249 px name, and the extra's name field 110 px for 297 px. The extra's name and "Applies to" now take a whole row each; method, amount and hours share the next.
  - The summary broke large amounts inside the number ("243 877 575 0 / 64 Ft" in HU at 1194), because `.review-flow` sets `overflow-wrap: anywhere` on `dd`. The final total now has its own row and summary amounts break only between words.
- The test covers the Work phases and Extras steps and the summary at both sizes in EN and HU: field text against its room, amounts on one line inside their cell, 44 px targets, no sideways page scroll, task language, and the link text in both languages. Without the three fixes it reports clipped fields on all eight step screens, amounts broken over two lines, and the old link text; with them it passes.
- Not changed: the private presets panel still has no card of its own; it now sits under the phase form at both sizes.
