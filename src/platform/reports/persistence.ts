import type { LocalVault } from '../vault/vault';
import type { ReportDraft } from './types';

export function reportRepository(vault: LocalVault) {
  const store = vault.reports();
  return {
    async load(project: string) {
      const row = await store.changed(project, 0);
      if (!row) return;
      const document = JSON.parse(row.text) as ReportDraft;
      if (
        document.schema !== 1 ||
        document.project !== project ||
        !Number.isSafeInteger(document.projectRevision) ||
        !document.settings
      )
        throw new Error('Invalid report draft');
      return { revision: row.revision, document };
    },
    async save(project: string, revision: number, document: ReportDraft) {
      if (document.schema !== 1 || document.project !== project)
        throw new Error('Invalid report project');
      return store.save(project, revision, JSON.stringify(document));
    },
  };
}
