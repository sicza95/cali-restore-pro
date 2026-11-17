import { calculate } from '../estimates/calculate';
import type { EstimateDocument, EstimateInput } from '../estimates/types';
import type { ReportDraft } from '../reports/types';
import { maxLocalDocument } from './crypto';

export type BackupDocuments = { estimate?: string; report?: string };
export type DocumentShape = { kind: keyof BackupDocuments; bytes: number };

/** Separate authenticated frames keep the existing 1 MiB project index bound intact. */
export function documentShapes(value: unknown): DocumentShape[] {
  if (!Array.isArray(value) || value.length > 2) throw new Error('Invalid document index');
  const kinds = new Set<string>();
  for (const shape of value as DocumentShape[]) {
    if (
      !shape ||
      (shape.kind !== 'estimate' && shape.kind !== 'report') ||
      kinds.has(shape.kind) ||
      !Number.isSafeInteger(shape.bytes) ||
      shape.bytes <= 16 ||
      shape.bytes > 4 * (shape.kind === 'estimate' ? maxLocalDocument : 64 * 1024) + 16
    )
      throw new Error('Invalid document shape');
    kinds.add(shape.kind);
  }
  return value as DocumentShape[];
}

/** Rebind identities and preserve freshness relative to the backed-up project. */
export function restoreDocuments(
  documents: BackupDocuments,
  source: string,
  destination: string,
  files: ReadonlyMap<string, string>,
  sourceRevision?: number,
): BackupDocuments {
  const result: BackupDocuments = {};
  const file = (id: string) => files.get(id) ?? id;
  const revision = (value: number) =>
    Number.isSafeInteger(sourceRevision) && sourceRevision! > 0 && value === sourceRevision ? 1 : 0;
  if (documents.estimate !== undefined) {
    const doc = JSON.parse(documents.estimate) as EstimateDocument;
    if (doc.schema !== 1 || doc.draft.project !== source || !Array.isArray(doc.snapshots))
      throw new Error('Invalid backup estimate');
    const input = (value: EstimateInput): EstimateInput => {
      if (value.project !== source) throw new Error('Invalid backup estimate project');
      return {
        ...value,
        project: destination,
        revision: revision(value.revision),
        phases: value.phases.map((phase) => ({
          ...phase,
          ...(phase.scopeSource === undefined ? {} : { scopeSource: file(phase.scopeSource) }),
          ...(phase.quantity
            ? {
                quantity: {
                  ...phase.quantity,
                  project: phase.quantity.project === source ? destination : phase.quantity.project,
                  ...(phase.quantity.source === 'committed'
                    ? {
                        revision: phase.quantity.revision.replace(/^\d+(?=\/)/, (value) =>
                          String(revision(Number(value))),
                        ),
                      }
                    : {}),
                },
              }
            : {}),
        })),
      };
    };
    result.estimate = JSON.stringify({
      ...doc,
      draft: input(doc.draft),
      snapshots: doc.snapshots.map((snapshot) => {
        const next = input(snapshot.input);
        if (JSON.stringify(calculate(next)) !== JSON.stringify(snapshot.result))
          throw new Error('Backup estimate snapshot mismatch');
        return { ...snapshot, input: next };
      }),
    });
  }
  if (documents.report !== undefined) {
    const doc = JSON.parse(documents.report) as ReportDraft;
    if (
      doc.schema !== 1 ||
      doc.project !== source ||
      !Number.isSafeInteger(doc.projectRevision) ||
      !doc.settings
    )
      throw new Error('Invalid backup report');
    result.report = JSON.stringify({
      ...doc,
      project: destination,
      projectRevision: revision(doc.projectRevision),
      settings: {
        ...doc.settings,
        surfaces: Object.fromEntries(
          Object.entries(doc.settings.surfaces).map(([id, selection]) => [
            id,
            { ...selection, references: selection.references.map(file) },
          ]),
        ),
      },
    });
  }
  return result;
}
