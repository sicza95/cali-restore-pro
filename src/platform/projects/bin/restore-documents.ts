import type { EstimateDocument } from '../../estimates/types';
import type { ReportDraft } from '../../reports/types';
import type { BinRestoredDocuments } from '../../vault/bin-restored-documents';
import type { LocalVault } from '../../vault/vault';
import type { SavedProjectV2 } from '../types';
import type { BinRecoveryBody, SavedText } from './capture';
import { journalRestores, mergeDocument } from './merge';

/** Merge only restored subtree content, maintaining the receiving device's existing drafts. */
export async function restoreDocuments(
  vault: LocalVault,
  next: SavedProjectV2,
  bodies: readonly BinRecoveryBody[],
): Promise<BinRestoredDocuments> {
  const project = next.id;
  const journals = bodies.flatMap((body) => body.journals);
  const currentJournals = new Map<string, SavedText>();
  for (const { surface, source } of journals) {
    const current = await vault.projects().readJournal({ project, surface, source });
    if (current) currentJournals.set(`${surface}:${source}`, current);
  }
  const drafts: BinRestoredDocuments['drafts'][number][] = [];
  for (const kind of ['estimate', 'report'] as const) {
    const captured = bodies.flatMap((body) => body.documents).filter((doc) => doc.kind === kind);
    if (!captured.length) continue;
    const current = await (kind === 'estimate' ? vault.estimates() : vault.reports()).changed(
      project,
      0,
    );
    let merged = current;
    for (const capture of captured) {
      const source =
        merged ??
        (capture.scope === 'subtree' ? { revision: 0, text: emptyDraft(kind, next) } : undefined);
      const write = mergeDocument(capture, source);
      if (write) merged = { revision: current?.revision ?? 0, text: write.text };
    }
    if (merged && merged.text !== current?.text)
      drafts.push({ kind, expected: current?.revision ?? 0, text: merged.text });
  }
  return { journals: journalRestores(project, journals, currentJournals), drafts };
}

function emptyDraft(kind: 'estimate' | 'report', project: SavedProjectV2) {
  if (kind === 'estimate') {
    const currency = project.overrides?.restoration?.currency ?? project.settings.currency;
    return JSON.stringify({
      schema: 1,
      snapshots: [],
      draft: {
        schema: 1,
        project: project.id,
        revision: project.revision,
        currency,
        priceCurrency: currency,
        objects: project.objects.map(({ id, name, surfaces }) => ({
          id,
          name,
          surfaces: surfaces.map(({ id }) => id),
        })),
        selected: project.objects.map(({ id }) => id),
        phases: [],
        extras: [],
        adjustments: [],
        tax: { enabled: false, rate: '' },
        assumptions: '',
      },
    } satisfies EstimateDocument);
  }
  return JSON.stringify({
    schema: 1,
    project: project.id,
    projectRevision: project.revision,
    savedAt: new Date(project.updatedAt).toISOString(),
    settings: {
      language: project.overrides?.restoration?.reportLanguage ?? 'en',
      unit: 'inherited',
      excluded: [],
      surfaces: {},
      content: { map: true, legend: true, table: true, detail: false },
      notes: '',
      finances: 'none',
      estimate: '',
      brandingSource: 'omit',
      format: 'PDF',
      resolution: '300',
      workbook: 'snapshot',
    },
  } satisfies ReportDraft);
}
