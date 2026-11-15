# Vitest for `src/platform`

Quality baseline [Phase 3 item 1](../reviews/2026-11-14-quality-baseline.md): add Vitest for
`src/platform/**` with test vectors for estimates, geometry, vault crypto and the revision queue,
and run it in CI.

## Today

`src/platform` has no unit tests. Its arithmetic, geometry and crypto are covered only indirectly
by the Playwright suites (`test:estimates`, `test:sync`, `test:files`, `test:app`), which need the
Compose stack and a browser and report failures far from the cause.

## Target

- **Tooling:** `vitest` pinned as a dev dependency, plus `fake-indexeddb` (pinned) because the
  revision queue reads and writes IndexedDB. No other libraries.
- **Script:** `npm run test:unit` runs `vitest run`.
- **Config:** `vitest.config.ts`, Node environment, `include: ['src/platform/**/*.test.ts']`. Test
  files sit next to the module they cover (`calculate.ts` → `calculate.test.ts`), so lint, the
  400-line limit, Prettier and `tsc` cover them through the existing `src` include.
- **CI:** a `unit` job, "Unit tests (Vitest)", in `.github/workflows/ci.yml`, parallel to
  `frontend`, `go` and `e2e`, where the placeholder comment sits today.

## Test vectors

Each vector has a hand-computed expected value, not one copied from the code's output.

| Area           | Module                                                                                             | Vectors                                                                                                                                                                                                                           |
| -------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Decimal        | `estimates/decimal.ts`                                                                             | parsing (comma, leading dot, sign, limits), exact sums, half-away-from-zero rounding for positive and negative ties                                                                                                               |
| Estimate       | `estimates/calculate.ts`, `units.ts`                                                               | currency precision (HUF 0, EUR 2), hourly / fixed / area pricing, time and productivity modes, factor, unit conversion, extras, adjustments, tax, rounding at each stage, incomplete measurement → `null` totals, input rejection |
| Geometry       | `projects/planar-mask.ts`, `planar-transform.ts`, `planar-calibration.ts`, `planar-measurement.ts` | polygon area, holes, overlapping union, curve flattening, matrix inverse/project, calibration scale for dimensions and lines, `displayArea` units, `measurePlanar` on a calibrated synthetic surface                              |
| Vault crypto   | `vault/crypto.ts`                                                                                  | seal/open round-trip, envelope shape, wrong key / account / purpose rejected, tampered ciphertext / salt rejected, size limits, `importCode` validation                                                                           |
| Revision queue | `vault/revision-queue.ts`, `projects/revisions.ts`                                                 | staged drafts drain in project order, ack clears the draft, 5xx/429 keeps it for retry, conflict/epoch/access block it, stale replace rejected, `revisionBlockFor` table                                                          |

Network calls in the revision queue go to a stubbed `fetch`; nothing talks to a server.

## Constraints

- Platform behaviour does not change. A test that exposes a bug is reported; an obvious minimal
  fix goes in its own commit.
- `src/` source files are not edited (PR #21 is landing there); only `*.test.ts` files are added.

## Done

- `npm run check`, `npm run test:unit` and `npm test` pass locally.
- The pull request's four CI jobs are green and every commit is Verified.
