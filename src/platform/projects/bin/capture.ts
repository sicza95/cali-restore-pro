import type { EstimateDocument, EstimateInput } from '../../estimates/types';
import type { ReportDraft, ReportSettings } from '../../reports/types';
import { coverageOf } from './coverage';
import { BinError } from './errors';
import type { BinTrashPlan } from './plan-trash';
import { surfacesOf, type BinEntity } from './subtree';
import type { BinCoverageClass, BinDocumentVersion, BinEntityRef } from './types';

export type SavedText = { revision: number; text: string };
export type BinJournalCapture = { surface: string; source: string; revision: number; text: string };
/** Rows of a project-scoped document owned by the deleted subtree. */
export type BinEstimateRows = Pick<EstimateInput, 'phases' | 'extras' | 'objects'>;
export type BinReportRows = Pick<ReportSettings, 'surfaces' | 'excluded'>;
export type BinDocumentCapture =
  | { kind: 'estimate'; scope: 'whole'; revision: number; text: string }
  | { kind: 'estimate'; scope: 'subtree'; revision: number; rows: BinEstimateRows }
  | { kind: 'report'; scope: 'whole'; revision: number; text: string }
  | { kind: 'report'; scope: 'subtree'; revision: number; rows: BinReportRows };

export type BinRecoveryBody = {
  schema: 1;
  deletionId: string;
  entity: BinEntityRef;
  captured: BinEntity;
  journals: BinJournalCapture[];
  documents: BinDocumentCapture[];
};

/** Injected vault readers; each returns undefined when nothing is saved. Errors fail capture. */
export type BinCaptureReaders = {
  journal(ref: {
    project: string;
    surface: string;
    source: string;
  }): Promise<SavedText | undefined>;
  estimate(project: string): Promise<SavedText | undefined>;
  report(project: string): Promise<SavedText | undefined>;
  /** Stored byte length of a vault file, undefined when the original is unavailable here. */
  assetBytes(id: string): Promise<number | undefined>;
};

export type BinCapture = {
  body: BinRecoveryBody;
  captured: BinCoverageClass[];
  documents: BinDocumentVersion[];
  assetBytes: number;
  missingAssets: string[];
};

/**
 * Captures what a deletion must retain. A failed read fails the capture; a missing original is
 * reported so a hosted deletion can be blocked rather than accepted incomplete.
 */
export async function captureRecovery(
  plan: BinTrashPlan,
  readers: BinCaptureReaders,
): Promise<BinCapture> {
  const project = plan.entry.entity.projectId;
  const journals: BinJournalCapture[] = [];
  for (const ref of plan.journals) {
    const row = await readers.journal(ref);
    if (row) journals.push({ surface: ref.surface, source: ref.source, ...row });
  }
  const whole = plan.entry.entity.kind === 'project';
  const documents: BinDocumentCapture[] = [];
  const estimate = await readers.estimate(project);
  if (estimate)
    documents.push(
      whole
        ? { kind: 'estimate', scope: 'whole', ...estimate }
        : {
            kind: 'estimate',
            scope: 'subtree',
            revision: estimate.revision,
            rows: estimateRows(estimate.text, plan.captured),
          },
    );
  const report = await readers.report(project);
  if (report)
    documents.push(
      whole
        ? { kind: 'report', scope: 'whole', ...report }
        : {
            kind: 'report',
            scope: 'subtree',
            revision: report.revision,
            rows: reportRows(report.text, plan.captured),
          },
    );
  let assetBytes = 0;
  const missingAssets: string[] = [];
  for (const id of plan.pins) {
    const bytes = await readers.assetBytes(id);
    if (bytes === undefined) missingAssets.push(id);
    else assetBytes += bytes;
  }
  const captured: BinCoverageClass[] = ['graph', 'checkpoints', 'journals', 'estimates', 'reports'];
  if (whole) captured.push('issued');
  if (!missingAssets.length) captured.push('assets');
  return {
    body: {
      schema: 1,
      deletionId: plan.entry.deletionId,
      entity: plan.entry.entity,
      captured: plan.captured,
      journals,
      documents,
    },
    captured,
    documents: [
      ...journals.map(({ surface, source, revision }) => ({
        key: `journal:${surface}:${source}`,
        version: revision,
      })),
      ...documents.map(({ kind, revision }) => ({ key: kind, version: revision })),
    ],
    assetBytes,
    missingAssets,
  };
}

export const captureCoverage = (plan: BinTrashPlan, capture: BinCapture) =>
  coverageOf(plan.entry.entity.kind, capture.captured);

function parse<T>(text: string): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new BinError('incomplete_recovery', { reason: 'unreadable document' });
  }
}

function owned(entity: BinEntity) {
  const surfaces = new Set(surfacesOf(entity).map(({ id }) => id));
  const objects = new Set(
    'objects' in entity
      ? entity.objects.map(({ id }) => id)
      : 'surfaces' in entity
        ? [entity.id]
        : [],
  );
  return { surfaces, objects };
}

export function estimateRows(text: string, entity: BinEntity): BinEstimateRows {
  const { draft } = parse<EstimateDocument>(text);
  const { surfaces, objects } = owned(entity);
  return {
    phases: draft.phases.filter(({ surface }) => surfaces.has(surface)),
    extras: draft.extras.filter(({ object }) => objects.has(object)),
    // Whole rows for owned objects; a surface keeps only its own entry in its parent's row.
    objects: draft.objects.flatMap((row) => {
      if (objects.has(row.id)) return [row];
      const kept = row.surfaces.filter((id) => surfaces.has(id));
      return kept.length ? [{ ...row, surfaces: kept }] : [];
    }),
  };
}

export function reportRows(text: string, entity: BinEntity): BinReportRows {
  const { settings } = parse<ReportDraft>(text);
  const { surfaces, objects } = owned(entity);
  return {
    surfaces: Object.fromEntries(
      Object.entries(settings.surfaces).filter(([id]) => surfaces.has(id)),
    ),
    excluded: settings.excluded.filter((id) => surfaces.has(id) || objects.has(id)),
  };
}
