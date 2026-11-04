# Restoration estimates and late outputs

Pricing means restoration-work estimates, as confirmed on 4 November 2026. No subscription tiers, payment provider, checkout, recurring billing or SaaS tax engine is required. Cloud feature grants and quotas remain administrative policy, separate from restoration prices.

## Estimation without the drawing engine

M-09 can implement the complete client-side calculation model and estimate UI against explicit fixture quantities. Production quantities later come through a versioned measurement interface: surface/layer/phase identity, committed assessment revision, calibration context, physical area/unit and validity state. The interface cannot return a plausible zero when geometry/calibration is unavailable. Preserve valid manual/fixed inputs and show what cannot yet be calculated; do not claim a measured estimate before real integration.

Keep the project model separate from personal defaults. Users define their own phases and can create, rename, reorder, duplicate, split, combine and archive them. Cleaning, tear repair/stitching, base application and repainting are editable examples, not formula branches. Each phase has one explicit independent mask/scope; users may clone another mask without linking subsequent edits. Never derive phase scope by automatically adding damage categories or infer it from a phase name.

## Calculation contract

For phase area `A`, entered productivity `S`, final entered time `T` and positive manual effort factor `F`:

| Mode/method           | Rule                                                                                        |
| --------------------- | ------------------------------------------------------------------------------------------- |
| Productivity input    | Base hours = `A / S`; final hours = `A / S × F`; effective productivity = `S / F`           |
| Final-time input      | Preserve `T`; effective productivity = `A / T`; implied baseline productivity = `A / T × F` |
| Hourly price, default | Final hours × hourly rate                                                                   |
| Area price            | Calibrated phase area × rate in the corresponding area unit                                 |
| Fixed price           | Entered fixed amount                                                                        |
| Phase subtotal        | Work price + independently entered additional material cost                                 |

Exactly one effort field is editable and the counterpart is visibly calculated. Both input modes apply independently of the pricing method. Empty material cost is zero; the effort multiplier does not multiply monetary rates, fixed/area prices or materials. In final-time mode a factor change explicitly offers Keep hours, Adjust hours or Cancel; adjusted time is `old T × new F / old F`, not `old T × new F`. In productivity mode a changed valid area preserves productivity and recalculates time. In time mode preserve entered hours and notify that the time assumption needs review. Missing calibration is a separate unavailable state.

Handle zero/empty/incompatible/nonfinite cases explicitly. A valid zero-area result is different from missing geometry; no division by zero, invented productivity or deletion of valid manual inputs. A display-unit change preserves physical quantities and does not create a false area-change warning. Main crop/master/calibration changes can change measured area; viewport navigation or detail-photo realignment cannot.

Object/project extras are optional named items without artificial masks. Fixed extras retain fixed cost with optional independent labour hours. Hourly extras cost entered hours × rate and contribute those hours. Cost-only expenses add no labour hours. Rental duration is not automatically labour. Sum selected objects' phase/material/object-extra contributions, then selected project-wide extras once at full value; no silent prorating. Preserve excluded objects/items in the project. Labour effort is distinct from calendar scheduling.

One explicit currency applies per project. Personal currency is an initial default, not a live link. Currency changes let users enter new rates/prices; no silent FX/repricing. Optional conversion is not a release dependency. Preserve issued snapshots' currency, units, quantities, rate/productivity versions, factor, input mode, selections and calculation version.

Apply each signed percentage adjustment to the **same unadjusted selected subtotal**; adjustments affect money only and never compound. Optional user-entered tax applies after adjustments, with tax-exclusive inputs. Store tax enabled/disabled independently from a configured rate. Use decimal money arithmetic; retain area/time/rate precision and round independently priced work/material/extra components to currency precision. Sum rounded components, independently round adjustment amounts, then round tax. Every UI/report/workbook total uses those same components. Record/test the exact decimal midpoint rule in M-09 rather than treating an unchosen rule as owner-confirmed.

Required arithmetic fixtures include:

- Area 10 cm², productivity 2 cm²/h and neutral factor produce 5 h; at 40 currency/h the work price is 200. At factor 2, time is 10 h and hourly price 400; area rate 15/cm² remains 150 and fixed 175 remains 175. Additional materials 30 stay independent.
- Time 10 h at factor 2 changed to factor 3 can stay 10 h or explicitly become 15 h; never 30 h.
- Subtotal 1,000 with +10% and −5% yields 1,050 regardless of row order. Illustrative 20% tax yields 1,260; hours stay unchanged.
- Two independently priced components of 1.006 round to 1.01 each at two currency decimals: subtotal 2.02, +10% = 0.20, before tax 2.22, illustrative 20% tax = 0.44, final 2.66.

These values are test data, not suggested professional rates or tax advice. Test mixed-unit normalization, selected objects/extras, zero/unavailable inputs, area-change notices, factor cancellation, immutable snapshots and reconciliation across outputs. The earlier estimating workbook is numerical reference only; its typed coverage workflow is not an application requirement.

## Permission-aware estimates

Personal rate/productivity libraries stay separately encrypted and private. Copy/version effective inputs into project estimates so library edits cannot rewrite issued estimates. Project assessment, quote summary and full estimate have separate encrypted scopes. Summary readers receive object subtotals, aggregate extras/adjustments and before-tax/tax/final/currency/version/freshness only, not hours, detailed materials, rates or phase calculations. Owners can independently grant assessment edit and full-estimate edit. A summary cannot be recomputed by a client missing private inputs; display stale provenance until an authorized client publishes a new projection.

## Outputs come after the platform

M-10 supplies the complete report workflow; M-11 supplies actual encoders using known fixture content. Generate **PDF, SVG, PNG, CSV and XLSX on authorized clients**, in workers where appropriate. Server-side plaintext report rendering would violate the confirmed content boundary. Large export memory/cancel behavior remains part of late device qualification. Encrypted portable backups arrive earlier in M-07 because they protect local-only work; they are not normal reports.

Reports identify project/object/surface, chosen revision/checkpoint and dates; show maps, legends, scale/units and valid surface/unique-damage/category quantities. Optional per-layer detail, notes, selected reference photos, checkpoint comparisons and authorized estimate summary/itemization remain explicit selections. Branding supports logo/studio/contact/accent/footer defaults and project overrides, with effective presentation captured per issued report. No institutional template is required. Report language is EN/HU independently of interface language, and a per-output unit override leaves saved project settings unchanged.

Choose current or a saved checkpoint independently for each surface and retain the matching masks/calibration/estimate provenance. Export selection does not restore or mutate active assessments. Missing/stale/incomplete results remain visible; labelled drafts are allowed, but final measurement claims require valid selected-revision results. Outputs from the pre-engine fixture workflow carry an explicit illustrative-data label and never appear as real project results.

Normal outputs physically omit unselected pixels/geometry/data, including embedded copies; hidden layers, off-page cells and clipping are insufficient. Omit location, camera/owner identifiers and original filenames by default; preserve correct orientation/color and let the user explicitly include permitted extras. Full original bytes/metadata belong in encrypted source storage/backups, not implicit normal exports.

CSV preserves numeric/unit meaning, quotes user text correctly and prevents formula injection. XLSX offers numeric snapshot and editable-estimate modes; editable formulas/hidden data may include only the recipient's authorized scope. Summary/assessment-only readers must not recover private rates/hours/materials from formulas, document XML, metadata or embedded images. SVG must contain no executable/external-fetch content. Inspect encoded payloads as well as rendered previews.

M-16 reruns fixture-oracle and permission/content checks with real committed geometry and sources. Confirm report/preview/data totals, output extent, selected-version scope and unit/rounding consistency on desktop and target iPad. Until then, encoder correctness is bounded fixture evidence rather than qualification of measured professional output.
