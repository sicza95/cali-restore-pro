# OUT-01 raw-mask export

Part of #54. The Outputs page offers a separate Raw mask section: select one surface, its current saved assessment or a named checkpoint, and one damage or phase layer, then download PNG.

The PNG uses the selected assessment's reference source width and height, with origin at the source photo's top-left. Saved layer geometry is filled opaque black using nonzero winding, preserving holes, on a transparent canvas. Pixels outside the source bounds are clipped. Empty layers produce a fully transparent PNG. Photo preparation (crop, rotation, flip, perspective), calibration, master-mask clipping, layer visibility, opacity, colour, hatching, background, grid and legend do not affect this raw output. Unsaved drawing drafts are not included. The image contains no report text, photo or physical print-scale declaration.

The existing report worker and download lifecycle handle this output. AbortSignal cancellation terminates the worker; vault access and project revision are checked before publishing a download. Dimensions must be positive safe integers, each at most 32,767, with at most 32 million pixels. Existing mask geometry limits and a 32 MB encoded PNG cap apply.

Evidence: `raw-mask.test.ts` checks native coordinates despite preparation, exact layer selection, missing and empty layers, dimension/pixel/geometry bounds and an already aborted signal. The raw-mask case in `tests-platform/report-exports.browser.ts` decodes worker-generated PNGs and compares all pixels for native dimensions, transparency, holes, checkpoint selection, empty masks and cancellation. Synthetic fixtures exercise the production encoder; they are not device qualification or real restoration data.

OUT-01 remains Partial. Composited-map work retains its existing evidence. Physical print scale, final issuance and workbook recalculation are outside this change; #54 stays open.
