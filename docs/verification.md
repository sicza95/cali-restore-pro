# UI foundation verification · 4 November 2026

This record covers the initial UI library, not the conservation engine or physical iPad qualification.

| Check                              | Result                                                                                       |
| ---------------------------------- | -------------------------------------------------------------------------------------------- |
| TypeScript, ESLint and Prettier    | Pass                                                                                         |
| Static Storybook build             | Pass; 24 stories                                                                             |
| Playwright browser suite           | 11 passed                                                                                    |
| Story smoke coverage               | All 24 stories render without browser errors                                                 |
| Layouts and axe accessibility scan | Pass at 1194 × 834 and 834 × 1194 in both themes, plus 1440 × 900 dark                       |
| Tool rail                          | Left position, 44px controls, roving focus and explicit selection checked                    |
| Layer and view changes             | Visibility, selection and active tool remain independent                                     |
| Focus mode                         | Panels return without losing selected layer                                                  |
| Calibration dialog                 | Background focus blocked; invalid text retained; Escape and opener-focus restoration checked |
| Opaque preference                  | Removes blur while retaining the controls                                                    |
| Production-build design inspection | No findings at 1440, 768 and 390px, with the title-probe exception below                     |
| Dependency audit                   | Zero reported vulnerabilities in the installed lockfile                                      |

The five iPad/desktop screenshots and three production-inspection screenshots were opened for visual review. The default photo view now fits the full surface; image and mask transforms remain together in the illustrative close-up. Portrait uses a separate inspector below the canvas. All displayed quantities are the documented synthetic fixture values.

The design inspector's `no-title` rule is allowed because Storybook inserts a hidden error-page heading before the story and the probe reads the first `h1`. The editor's actual visible `h1` is **North wall** and was confirmed in the DOM and screenshots. This is a probe limitation, not a missing app heading. No other production-inspection rule was allowed.

Static style-scan warnings are intentional: the version/context labels belong to Storybook documentation or identify the current surface; shadows apply only to floating controls, dialogs and notices; selective glass is the owner's explicit preference and has opaque/reduced-transparency fallbacks.

Browser screenshots and viewport checks do not establish physical Pencil, touch cancellation, Safari/Home Screen, keyboard-safe-area or sustained-work performance. They also do not establish durable save, geometry, calibration accuracy, encryption or cloud behavior. Those remain separate qualification work.
