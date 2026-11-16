# Visible reason for blocked originals

16 November 2026 · Status: in progress · Issue: #79 · Found while doing [the draft source on the project page](draft-source.md) (#72)

Goal: when a photo's "Remove" button or role select in the originals list is disabled, the row says why in visible text, on the project page and the surface page, in EN and HU and both themes, so the reason shows on an iPad, where there is no hover.

## Where things stand

On `main` at `eadf260`, `ProjectOriginals` (`src/ui/projects/ProjectOriginals.tsx`, both pages) disables the controls of a row and gives the reason only as the control's `title`: a hover tooltip and the accessible description. On touch nothing explains the greyed-out controls.

**Blocked states, checked in code** (`draftBlocks` in `src/platform/projects/surface-attachments.ts`, the checkpoint rule in the component). The reference is the first photo with the mapping role.

| Photo                                           | Role select            | "Remove"                                                            |
| ----------------------------------------------- | ---------------------- | ------------------------------------------------------------------- |
| The reference, its journal holds drafts         | blocked, `draftPhoto`  | blocked, `draftPhoto`                                               |
| Listed before that reference                    | blocked, `draftPhoto`  | free, unless a rule below applies                                   |
| Not the reference, its own journal holds drafts | free, unless rule 2    | blocked, `hiddenDraftPhoto`                                         |
| Used by a saved checkpoint                      | unchanged by this rule | blocked; reason `checkpointPhoto` only when no draft rule names one |

The rules combine per photo. A photo listed before the reference can hold drafts itself (older data, another device's revision): its role select says `draftPhoto` and its "Remove" says `hiddenDraftPhoto`, two different reasons in one row. A photo listed before the reference can also be used by a checkpoint (`draftPhoto` on the role, `checkpointPhoto` on "Remove"). When a draft rule and the checkpoint rule both block "Remove", the draft reason is the one given, as today. While the page reads the journals (or saves) every control is held disabled with no reason; that stays as it is.

## Approach

Direction from the orchestrator, as defaults for the owner: show the reason for every state above, the checkpoint one included (the issue leaves that open; consistency is the default), with the app's plain help text style, not a warning box.

1. **Row.** Under the row's name, role select and "Remove", one `<p class="field-help">` per distinct reason, in control order (role, then "Remove"). One reason for both controls shows once; two different reasons show as two lines. `.field-help` is the app's help text (muted ink, 14 px, the same tokens in both themes), used for inline reasons such as the disabled "Resend" in project invitations. The paragraph takes the row's full width (`flex: 1 0 100%`), so the name and controls keep their line and the sentence wraps inside the row.
2. **Layout.** At 1194 the originals pane is wide: the name, role select and "Remove" stay on one line and each reason is one line below them. At 834 the pane is about 740 px wide: the same, and the long HU `hiddenDraftPhoto` sentence (about 115 characters) wraps to two lines inside the row. Two reasons stack. The controls do not move, and 44 px targets are unchanged.
3. **Accessibility.** Each blocked control gets `aria-describedby` pointing at the paragraph with its own reason, and loses its `title`, so the description is the visible sentence and is given once per control; the hover tooltip goes, since the text is on screen. Ids come from `createUniqueId` and the photo id. A paragraph that both controls point at is one element. The paragraph is ordinary text, not a live region.
4. **Copy.** The three sentences read as visible text: "Resolve the drawing drafts before changing this original.", "This original has drawing drafts. To resolve them, make it the first original with the Mapping role." and "A saved checkpoint uses this original." (HU likewise). No wording change.

## Verification

- The existing checks of the controls' accessible description (`tests-platform/draft-source.ts`, `reference-change.ts`) stay unchanged and must keep passing: the description is still exactly the reason.
- A new helper (`tests-platform/original-reasons.ts`) checks, for a row: the visible reasons are exactly the expected distinct sentences, in order; each is visible, inside the row and inside every clipping ancestor, with no overflow; each blocked control's `aria-describedby` points at the paragraph with its reason, and it has no `title`; the row's controls stay inside the row; no horizontal page scroll at 834. After a block lifts, the row shows no reason.
- States covered in the projects flow, on both pages: the reference with drafts (#72 surface), the earlier photo's role (#75), hidden drafts, the checkpoint reason on the main surface, and a new two-reason state (a third photo with the mapping role becomes the reference and gets a pending mark while the hidden-draft photo is listed before it). EN and HU at 1194 and 834 for each, light and dark with axe on the originals list in the two-reason state.
- Run the new assertions against the old component to see them fail. `npm run check`, `test:unit`, `npm test`, `test:files` (the projects flow also with `--repeat-each 5`), `build-storybook`. Look at the screenshots of each state on both pages.
