# One app shell

Quality baseline [Phase 2 item 4](../reviews/2026-11-14-quality-baseline.md): one app shell on the
router (`src/ui/router/`, `src/ui/app-context/`): a sidebar in landscape, a compact header with a
drawer in portrait, real breadcrumbs and consistent page titles. Retires UX finding 5. Targets are
iPad (1194 × 834 and 834 × 1194) and desktop ([ADR 0003](../adr/0003-ipad-and-desktop-only.md)).

## Today

Before screenshots: `test:files` captures of the estimate (1194, 834) and a surface (1194), kept
outside the repo.

- **Two navigation patterns.** From 1100 px the account navigation is a sticky sidebar; below it a
  "Menu" button expands the links inline, pushing the page down. Surface routes always use the Menu
  bar, at every width, chosen with `.account-shell:has(.surface-heading)`.
- **The page title is the route, not the page.** The shell's `h1` is the route name, so every
  project page says "Projects": above "Estimate" on the estimate, above "East Chapel" on a project,
  and visually hidden on a surface, where the screen's `h2` is the real title.
- **Breadcrumbs are three hand-made link rows.** "All projects · East Chapel" on the estimate
  (`ProjectReview`), "All projects" on a project (`ProjectWorkspace`), "East Chapel" on a surface
  (`SurfaceWorkspace`). They are plain underlined links with no separators and no current page.
- The portrait Menu is a disclosure, not a drawer: focus is not contained and Escape does nothing.

## Design

- **Landscape (from 1100 px): sidebar on every signed-in page.** Surface pages, where the canvas
  needs the width, get the same sidebar collapsed to a 72 px icon rail (labels visually hidden,
  tooltips, language as "EN"/"HU"). Navigation is always on the left, like the tool rail.
- **Portrait (below 1100 px): compact header** with the product name, the app language and a Menu
  button. Menu opens a **drawer** from the left: a modal `<dialog>` (the rest of the page is inert,
  so focus stays in it), a heading and a Close button, the links and Sign out. Escape, Close, the
  backdrop and any navigation close it; focus returns to the Menu button.
- **Breadcrumbs from the route table.** `src/ui/router/breadcrumbs.ts` turns a route into a trail
  (`projects` → project → surface or review step), with hrefs from the route builders. The shell
  renders it above the title as an ordered list with chevron separators, the current page as
  `aria-current="page"` text, 44 px targets and no underline until hover. Names of projects and
  surfaces are local vault data, so `ProjectWorkspace` publishes them to the app context
  (`app.names`); until they load, the trail shows "Project" or "Surface". Routes with a one-step
  trail show no breadcrumbs.
- **One title per page.** The shell's `h1` is the last step of the trail: "Projects", "East
  Chapel", "Estimate", "Upper plaster", "Preferences". The duplicate `h2`s in `ProjectDetail`,
  `ProjectReview` and `SurfaceWorkspace` go; the object name stays above the surface tabs.
- The crumb links keep the control ids of the links they replace (`project.library`,
  `project.review.parent`, `surface.project`). The surface editor's own header (breadcrumb and
  title inside the editor) is unchanged.
- Public pages (sign in, register, email links) keep their top bar; they have no navigation.

## Steps

1. This plan.
2. Breadcrumb trail in the router, with Vitest tests; `app.names` in the app context.
3. Shell: sidebar, rail, compact header and drawer, breadcrumbs and title; remove the screens' own
   back links and duplicate headings; EN and HU copy; tests updated.

## Verification

`npm run check`, `npm run test:unit`, `npm test`, `npm run build-storybook`, `npm run test:files`,
`npm run test:estimates`, and `npm run test:app` on a disposable Compose project. Screenshots at
1194 × 834 and 834 × 1194 for the library, a project, the estimate and a surface; axe at both sizes
with the drawer open; keyboard: Tab order header → content, drawer traps focus and returns it.
