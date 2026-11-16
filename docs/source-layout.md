# Source layout

Organize files by feature or package. In the UI, keep feature components, state, request code and helpers together under `src/ui/<feature>/`. Use `src/ui/index.ts` for components shared with Storybook or other consumers, and import sibling modules directly within a feature. In Go, keep the package boundary and use files named for responsibilities within it.

- Keep authored source files within 400 physical lines, including whitespace and comments. ESLint checks JavaScript and TypeScript. Review the same limit for Go and CSS. Generated API types and other generated artifacts are exempt.
- Give each file one main responsibility. Split complex components into named child components for distinct views or sections, and move state coordination and requests into their own modules when they have independent responsibilities.
- Give each component a folder, such as `src/ui/editor/editor-workspace/`. Place its component, props, constants, helpers, styles and assets there as needed. Keep files used by multiple components in their nearest shared scope. Omit empty companion files.
- Keep named types in the owning scope’s `types.ts` and static data in its `constants.ts`. Use descriptive filenames when a scope needs several type or data files.
- Keep pure helpers in the owning scope’s `utils.ts` or a file named for the behavior, such as `moveFocus.ts`. Share helpers when multiple scopes need the same behavior.
- Group styles by the UI they style. When splitting an existing stylesheet, preserve its import and cascade order.

The convention draws on feature colocation and single-purpose files, with the 400-line limit chosen for this repository. [Angular style guide](https://angular.dev/style-guide) · [Redux style guide](https://redux.js.org/style-guide/#structure-files-as-feature-folders-with-single-file-logic) · [ESLint max-lines](https://eslint.org/docs/latest/rules/max-lines)
