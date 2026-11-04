# CaliRestore Pro

This repository starts with the UI library. It is not a replacement editing engine.

- Use SolidJS, TypeScript and semantic CSS. Components live in `src/ui`; Storybook compositions live in `src/stories`.
- Keep production renderer, persistence, encryption and project data independent of the UI. Stories use synthetic in-memory data.
- iPad first: 1194 × 834 landscape and 834 × 1194 portrait. Tools stay on the left. Portrait inspectors dock below the canvas.
- Use tokens for both themes. Translucency is reserved for floating tools and masks; fields and inspectors are opaque. Preserve the opaque fallback and reduced-transparency preference.
- Maintain at least 44px touch targets, visible keyboard focus, labelled controls and distinct save/sync states.
- Avoid adding libraries, default components or alternate visual styles without a concrete need. One icon family, one type family.
- Run `npm run check`, `npm run build-storybook` and `npm test` for UI changes. Inspect landscape and portrait screenshots before delivery. Physical Pencil/Safari testing remains separate.
- Conventional commits. Do not import legacy application code, real project photos, credentials or runtime data.
- Follow `docs/plan/README.md` for the platform-first order: identity/rights, settings/admin, encryption, files/projects, sharing/revocation, offline recovery, complete UI, restoration estimates and outputs before image processing/drawing. Pricing means restoration estimates, not subscription billing.
- Give every implementation milestone its own PR and make frequent coherent conventional commits. Record prerequisite PRs for stacked work; do not auto-merge. Update requirement coverage and evidence, keeping mocks distinct from real saves, measurements and release qualification.
