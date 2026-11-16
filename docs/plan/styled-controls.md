# Styled controls and one primary per view

Quality baseline [Phase 2 item 5](../reviews/2026-11-14-quality-baseline.md): a styled file picker
and select, and a button hierarchy with one primary action per view. Retires the UI finding "native
unstyled controls, many equal-weight buttons". iPad and desktop only
([ADR 0003](../adr/0003-ipad-and-desktop-only.md)).

## Today

- **Every unclassed `<button>` is a primary.** The app's global `button` rule in
  `account-access/styles.css` is the dark primary style; `class="secondary"` opts out. 35 app buttons
  have no class, so the project page shows seven dark buttons (Open surface, three Renames, Add
  object, Add surface, Save settings) plus Attach original. The same rule sets white text, which
  turns shell buttons without their own colour white on white (process note, 2026-11-15).
- **Selects** use the browser's arrow and default padding.
- **File inputs** show the browser's grey "Choose file" button inside a field-looking box
  (Original files, Preferences logo, project backup restore, vault restore).
- Checkboxes are browser blue.

## Design

- **Secondary is the default.** The global `button` rule becomes the secondary style (raised
  surface, ink text); `button.primary` is the dark primary. A button is primary only when a screen
  says so. `class="secondary"` was removed (#40) and `src/ui/button-classes.test.ts` keeps it out.
- **One primary per view**, the action the view exists for. Everything else on those screens
  (renames, adds, settings saves, attach, sharing, owners, sync choices, password and email
  changes, restore inside a disclosure) is secondary.

| View                                 | Primary                                     |
| ------------------------------------ | ------------------------------------------- |
| Sign in, register, email links       | the form's submit                           |
| Project library                      | Create project                              |
| Project                              | Open surface (already a primary link)       |
| Surface: photo setup                 | Apply                                       |
| Surface: drawing                     | Apply mark / Save marks (editor, unchanged) |
| Surface: checkpoints                 | Create checkpoint; Confirm in the dialog    |
| Estimate step                        | Next, or Save estimate version on the last  |
| Report / Outputs                     | Download / Preview                          |
| Vault (setup, unlock)                | the current step's action                   |
| Invitations                          | Accept                                      |
| Preferences, libraries, admin search | Save, Save new version, Search              |

- **Select:** `appearance: none`, a chevron drawn with token colours, room for it in the padding, a
  hover border. Same height (44 px) and focus ring as fields.
- **File picker:** keep the native `<input type="file">` (label, keyboard and screen reader
  behaviour stay) and style `::file-selector-button` as a secondary button inside a dashed field.
- Checkboxes and radios take `accent-color: var(--cr-accent)`.
- Shell components (`cr-button`, `IconButton`) and the editor keep their own styles; editor buttons
  that relied on the global primary get `class="primary"`, so the editor looks the same.

## Steps

1. This plan.
2. Secondary by default, `primary` on the table's actions (app and editor).
3. Select, file picker and checkbox styles.

## Verification

`npm run check`, `npm run test:unit`, `npm test`, `npm run build-storybook`, `npm run test:files`,
`npm run test:estimates`, `npm run test:app` on a disposable Compose project. Screenshots at 1194 ×
834 and 834 × 1194 (project, surface, estimate, preferences) in light and dark; axe at each.
