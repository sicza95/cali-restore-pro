# Browser presentation API

Import public components and types from `./index`. Exact prop definitions live in
[`types.ts`](types.ts); all slots use Solid's `JSX.Element`.

| Component                       | Exact props type         |
| ------------------------------- | ------------------------ |
| `BrowserToolbar`                | `BrowserToolbarProps`    |
| `BrowserGrid`, `BrowserList`    | `BrowserCollectionProps` |
| `ItemTile`, `ItemRow`           | `ItemProps`              |
| `StatusBadge`                   | `StatusBadgeProps`       |
| `BrowserLayout`                 | `BrowserLayoutProps`     |
| `InspectorPanel`                | `InspectorPanelProps`    |
| `BrowserEmptyState`             | `BrowserEmptyStateProps` |
| `NewNameDialog`, `RenameDialog` | `NameDialogProps`        |
| `DeleteDialog`                  | `DeleteDialogProps`      |

- Collections consume `readonly BrowserItemDescriptor[]` from the shared platform
  contract. They never import the platform browser implementation. Callbacks pass
  stable item IDs. The caller owns ordering, filtering and mutations.
- `selectedId: string | null` is controlled. `onSelect(id: string | null)` normalises
  an absent selection to the first visible item, then keeps the next surviving
  neighbour after deletion/filtering. Sorting and view changes preserve the ID.
- `BrowserView = 'grid' | 'list'`;
  `BrowserSort = { field: 'name' | 'created' | 'modified'; direction: 'asc' | 'desc' }`.
- `BrowserPreview = { cover?: string; images?: readonly string[] }`. URLs must
  already represent thumbnails. A cover replaces the deck; at most three deck
  images render. The caller owns loading, cancellation and URL revocation.
  Directory entries suppress all supplied preview images, counts and modified dates.
- `BrowserDiagnostic = { message: string; position?: number }`. Messages are already
  localised. Positions are displayed as supplied; adapt the parser's coordinate
  convention before passing them in. Invalid results remain the caller's last valid
  `items` value. The toolbar caps query input at 1,024 characters.
- `BrowserToolbarProps.ref?: (handle: BrowserToolbarHandle) => void` receives
  `{ focusFind: () => void }`. Connect collection/layout `onFind` to that handle.
  Connect layout `onParent` for shortcuts while toolbar or inspector controls have
  focus. Inputs, editable content, composing input and dialogs ignore shortcuts.
- Disabled action reasons use focusable `aria-disabled` buttons with accessible
  descriptions and native tooltips. The caller supplies permission/draft reasons;
  collection keyboard actions also guard descriptor access. Directory entries cannot
  open; read-only entries can open but cannot rename/delete.
- Mount dialogs conditionally and unmount in `onClose` or after a successful command.
  `onConfirm` requests an operation; it never closes the dialog automatically. The
  caller supplies `busy`, `error` and deletion `blockedReason`. Descendant counts
  include the entire subtree; `null` renders Unknown. Project deletion describes
  trash/recovery; child deletion describes permanent removal.
- `BrowserLayout` slots are `toolbar`, `inspector` and `children`. The right inspector
  is 304px at landscape/desktop widths and 288px at 834px. Content and inspector
  scroll separately. `announcement?: string` is for command outcomes; status badges
  do not announce every sync refresh.
- `InspectorPanel` provides named slots `preview`, `details`, `storage`,
  `restorationDefaults`, `reportBranding`, `access`, plus `title` and `onClose`.
  It supplies section scaffolding, not settings/access editors.
- `useBrowserPreferences(level: Accessor<BrowserItemKind>, options?: {
storage?: Pick<Storage, 'getItem' | 'setItem'>; portrait?: boolean })` returns
  `view`, `sort`, `inspectorOpen` accessors and `setView(view: BrowserView)`,
  `setSort(sort: BrowserSort)`, `setInspectorOpen(open: boolean)`. Preferences are
  stored separately per level; invalid/unavailable storage falls back to grid,
  name ascending and inspector closed in portrait. This optional hook stores no
  project content.
- `browserControls` is the colocated control inventory, marked `review` until
  integration connects durable operations. Merge it into the application inventory
  in the integration slice.

The stories use synthetic descriptors and the existing generated plaster image.
Only plain-name Find is demonstrated in memory. Structured query parsing, routing,
settings, storage, image loading and durable changes belong to integration.

## Mounted browser layout

The page breadcrumb stays above the toolbar at every browser level, including the root.
The shell fills the viewport; the collection and inspector scroll independently. Grid cells
are fixed 176 × 176 px squares with 128 × 128 px previews. Column count follows available
width, including space taken by the inspector. Tiles and list rows show the preview, name and an always-visible corner status icon
with an accessible status label; double-click or Enter opens the selection. Metadata and access reasons remain
available in the inspector and to assistive technology. The root import action uses a
Font Awesome cloud-upload glyph. The shared Icon component bundles Font Awesome locally.
All signed-in routes share a 60px top bar and an 8px outer page inset. Non-browser
content scrolls inside the current page; the browser keeps its own collection and
inspector scrollers. The inspector keeps a 96px preview and storage status visible,
with metadata, cover controls and advanced settings in closed disclosure sections.
