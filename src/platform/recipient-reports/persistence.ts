import { parseEstimateScope } from '../estimates/scopes';
import { parseSharedProject } from '../projects/shared-project';
import type { LocalVault } from '../vault/vault';
import type { RecipientReportKey } from '../vault/recipient-reports';
import { surfaceKeys } from './scope';
import { recipientFormats } from './types';
import type { RecipientReport } from './types';

const levels = { 'estimate-summary': 'summary', 'estimate-full': 'full' } as const;

/** Reads a stored recipient draft back, refusing one that does not match its key or its rules. */
export function parseRecipientReport(text: string, key: RecipientReportKey): RecipientReport {
  const value = JSON.parse(text) as RecipientReport;
  const settings = value?.settings;
  if (
    value?.schema !== 1 ||
    value.kind !== 'recipient-draft' ||
    value.project !== key.project ||
    value.invitation !== key.invitation ||
    typeof value.sender !== 'string' ||
    typeof value.savedAt !== 'string' ||
    !settings ||
    !['en', 'hu'].includes(settings.language) ||
    typeof settings.notes !== 'string' ||
    !Array.isArray(settings.excluded) ||
    !recipientFormats.includes(settings.format)
  )
    throw new Error('Invalid recipient report');
  const source = parseSharedProject(JSON.stringify(value.source));
  const keys = surfaceKeys(source);
  if (settings.excluded.some((surface) => !keys.includes(surface)))
    throw new Error('Invalid recipient report surface');
  const { estimate } = value;
  if (estimate) {
    if (levels[estimate.scope] !== settings.finances || typeof estimate.text !== 'string')
      throw new Error('Invalid recipient report estimate');
    parseEstimateScope(estimate.scope, estimate.text, key.project);
  } else if (settings.finances !== 'none') throw new Error('Invalid recipient report estimate');
  return { ...value, source };
}

export function recipientReportRepository(vault: LocalVault) {
  // A fresh store per call: the vault row's stamp changes when, for example, a sender is pinned.
  const store = () => vault.recipientReports();
  return {
    async load(key: RecipientReportKey) {
      const row = await store().load(key);
      return row && { revision: row.revision, document: parseRecipientReport(row.text, key) };
    },
    async list() {
      const rows = await store().list();
      return rows.map((row) => ({
        revision: row.revision,
        document: parseRecipientReport(row.text, row),
      }));
    },
    save(revision: number, document: RecipientReport) {
      const key = { project: document.project, invitation: document.invitation };
      parseRecipientReport(JSON.stringify(document), key);
      return store().save(key, revision, JSON.stringify(document));
    },
    remove(key: RecipientReportKey, revision: number) {
      return store().remove(key, revision);
    },
  };
}
