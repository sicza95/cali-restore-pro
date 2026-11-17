import type { EstimateSnapshot } from '../estimates/types';
import type { ReportCopy } from './copy';
import { coversEstimate } from './estimate';
import type { Draft, PreviewSurface, ReportIssuance, ReportSettings } from './types';

/** Historical issued versions remain valid sources; a newer draft does not replace them. */
export function finalReportBlock(
  snapshot: EstimateSnapshot | undefined,
  surfaces: readonly PreviewSurface[],
  finances: ReportSettings['finances'],
):
  | keyof Pick<
      ReportCopy,
      | 'finalNoSurfaces'
      | 'finalNoEstimate'
      | 'finalIncomplete'
      | 'finalUnissued'
      | 'finalOutsideScope'
    >
  | undefined {
  if (!surfaces.length) return 'finalNoSurfaces';
  if (finances === 'none' || !snapshot) return 'finalNoEstimate';
  if (!snapshot.result.complete || snapshot.result.total === null) return 'finalIncomplete';
  if (!snapshot.issued) return 'finalUnissued';
  if (!coversEstimate(snapshot, surfaces)) return 'finalOutsideScope';
}

export function issueReport(draft: Draft, snapshot: EstimateSnapshot | undefined): ReportIssuance {
  const blocked = finalReportBlock(snapshot, draft.surfaces, draft.estimate ? 'summary' : 'none');
  if (
    blocked ||
    !snapshot ||
    draft.estimateState ||
    draft.estimate?.draft ||
    draft.estimate?.summary.snapshot !== snapshot.id
  )
    throw new Error('Issued complete estimate in report scope required');
  const issuance = {
    issuedAt: new Date().toISOString(),
    estimate: { id: snapshot.id, version: snapshot.version, createdAt: snapshot.createdAt },
  };
  assertReportIssuance({ ...draft, issuance });
  return issuance;
}

/** Encoders reject inconsistent final provenance rather than silently claiming finality. */
export function assertReportIssuance(draft: Draft) {
  if (!draft.issuance) return;
  const source = draft.estimate;
  if (
    !source ||
    source.draft ||
    source.complete !== true ||
    draft.estimateState ||
    source.summary.total === null ||
    draft.issuance.estimate.id !== source.summary.snapshot ||
    draft.issuance.estimate.version !== source.summary.version ||
    draft.issuance.estimate.createdAt !== source.summary.createdAt
  )
    throw new Error('Invalid final report provenance');
}
