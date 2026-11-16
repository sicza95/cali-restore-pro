# Surface header

16 November 2026 · Status: done · Issue: #39 · Source: [quality baseline re-score](../reviews/2026-11-14-quality-baseline.md#re-score-after-phases-1-to-4), UX finding 5

Goal: one title per surface page. The shell's breadcrumbs and title carry the surface's identity; the drawing editor's own header stops repeating them; the object name moves into the trail. The space this frees goes to the photo canvas. iPad and desktop only ([ADR 0003](../adr/0003-ipad-and-desktop-only.md)).

## Where things stand

On a surface page the shell shows "Projects › East Chapel › Upper plaster" and the title "Upper plaster". Under the vault bar and the save line, a muted line names the object ("North wall"). In drawing mode the editor header then repeats the brand ("CaliRestore"), the trail ("East Chapel / North wall") and the title as a second `h1` ("Upper plaster ⌄"), beside the save status and the undo, redo, focus and export buttons.

Measured on `main` at `6b4fc02` (`projects.browser.ts`, page scrolled to the top):

| Viewport   | Photo canvas top | Photo canvas height | Share of the first screen | Drawing canvas top | Drawing share |
| ---------- | ---------------: | ------------------: | ------------------------: | -----------------: | ------------: |
| 1194 × 834 |           394 px |              434 px |                    52.0 % |             463 px |        44.5 % |
| 834 × 1194 |           446 px |              794 px |                    62.6 % |             515 px |        56.9 % |

## Approach

1. **The shell carries identity.** The object name becomes a plain-text step in the breadcrumb trail, between the project and the surface: "Projects › East Chapel › North wall › Upper plaster". It is not a link (objects have no page). The project screen provides it through the app context, beside the record names it already provides, so it leaves the shell when the vault locks. The muted object line under the save status goes.
2. **The editor header drops its identity when embedded.** `EditorWorkspace` takes `title` and `breadcrumb` as optional; without them it renders no brand, trail or `h1`, and its header row shrinks from 68 to 56 px (the 44 px buttons plus padding). The surface page passes neither, so the drawing editor's header holds only the save status and the workspace actions. Storybook keeps passing both, so the standalone editor is unchanged.
3. **The canvas takes the space.** The photo canvas height subtracts the chrome above it as a fixed number (`surface-styles.css`); it drops by the height the object line took.

No new copy: the object name is data, and the trail's label already exists in EN and HU.

## Verification

- `projects.browser.ts` and its drawing and photo helpers: the trail names the object as plain text; the page has one `h1`; the drawing editor header has no brand or heading. The canvas share floors in `photo-review.ts` rise to the new values (they only get stricter), and the drawing canvas gets a floor of its own.
- `breadcrumbs.test.ts` unchanged (the route trail itself does not change).
- `npm run check`, `test:unit`, `npm test`, `test:files`, `build-storybook`; screenshots at 1194 × 834 and 834 × 1194 in photo, drawing and checkpoint modes, light and dark, EN and HU.

## Outcome

| Viewport   | Photo canvas top (was) | Photo canvas height (was) | Photo share (was) | Drawing canvas top (was) | Drawing share (was) |
| ---------- | ---------------------: | ------------------------: | ----------------: | -----------------------: | ------------------: |
| 1194 × 834 |           354 (394) px |              474 (434) px |     56.8 (52.0) % |             411 (463) px |       50.7 (44.5) % |
| 834 × 1194 |           406 (446) px |              834 (794) px |     66.0 (62.6) % |             463 (515) px |       61.2 (56.9) % |

- As planned: the object is a plain-text step in the trail, the embedded editor header holds only the save status and the actions in a 56 px row, and the page has one `h1`.
- The photo canvas height subtracts 360 px of chrome instead of 400. In portrait the shell's Menu header adds about 50 px, so the canvas ends about 45 px below the fold there, as it did before.
- `projects.browser.ts` checks the four-step trail, that the object step is not a link, and one `h1` on opening the surface. `drawing-review.ts` checks one `h1`, no brand in the editor header, a header of at most 56 px and a drawing canvas share of at least 50 % at 1194 and 60 % at 834, at both sizes. `photo-review.ts` now asks for a photo canvas share of at least 56 % and 65 % (was 50 % and 60 %).
- The vault bar and the save line stay: they are shared by every project page and say different things from the editor's save status.
