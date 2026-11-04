# UI direction · 4 November 2026

The owner preferred the generated references with a left tool rail and restrained transparency, confirmed iPad-first design, and identified inconsistencies across the larger reference set. Storybook is the place to resolve those differences in shared components.

The app-screen composition starts from the **framed-sheet** direction (seed **202666602**): quiet shared chrome, an inset work surface, one type family, neutral panels and color on meaningful data. The face comes from mineral-white/graphite surfaces and blue/ochre painted-plaster photography. The signature is a shared conservation mask viewed through an overview or detail image. The owner's transparency request explicitly overrides the design skill's usual ban on glass, limited to floating controls. No new style was drawn.

## Rules for this increment

1. The tool rail stays on the left in landscape and portrait. Tool and layer changes are separate operations.
2. The photo is the largest region. Landscape inspectors reserve space beside it; portrait inspectors reserve space below it. Focus mode keeps an obvious way back.
3. Use at least 44px touch targets and a visible keyboard focus ring. Toolbars use roving focus; selecting a tool is explicit.
4. One semantic token set drives both themes. Forms, quantities and inspectors are opaque. Glass has a solid fallback, a Storybook opaque control and a reduced-transparency media preference.
5. Local save, saving, offline, pending draft and failed-save states remain distinct. Stories do not perform durable writes.
6. Layer visibility changes presentation. Calibration and output selection belong to deliberate workflows. Invalid field text remains editable and is not published to the caller.
7. Default drawing preferences remain per-stroke commit, finger drawing off and constant width. No inactivity lock or automatic sign-out is introduced.

## Review order

Review tokens and controls first, then the landscape and portrait editor compositions. Consolidate the feedback into those components before adding more whole-app screens. Authentication, project library, alignment, reports, estimation, sharing and administration can then reuse this foundation rather than reproduce their raster references independently.

## Sample data and limits

North Chapel / Wall painting / North wall and all quantities are illustrative: assessed surface 6.00 m²; Flaking 0.42 m²; Lacunae 0.36 m²; unique Paint loss 0.78 m² (13.0%); separate Cracks 0.14 m² and Cleaning 0.90 m². These are review fixtures, not measurement-engine results. The generated photo is recorded in `public/photos/README.md`.

The editor composition owns only temporary review state. No production geometry, decoder, worker, vault, cloud protocol or recovery implementation is selected by this UI increment. Existing engine qualification and physical-device work remain separate.

## Tooling note

The lockfile uses patched Storybook, SolidJS and Vite releases. A targeted override moves development-tool dependencies on minimatch 10 to 11.0.1, the first patched release for [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249). Node 24 satisfies its runtime requirement. Keep the override until the lint-tool dependency ranges adopt the patch; type checking, linting, Storybook build and browser checks exercise the resulting toolchain.
