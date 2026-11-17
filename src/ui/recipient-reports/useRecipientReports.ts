import { createResource, createSignal, onCleanup } from 'solid-js';
import { exportReport } from '../../platform/reports/export';
import { recipientExportDraft } from '../../platform/recipient-reports/export-draft';
import { recipientReportRepository } from '../../platform/recipient-reports/persistence';
import type { RecipientReport } from '../../platform/recipient-reports/types';
import type { LocalVault } from '../../platform/vault/vault';

export type SavedRecipientReport = { revision: number; document: RecipientReport };

/** The recipient's own report drafts on this device, with save, delete and download. */
export function useRecipientReports(vault: LocalVault) {
  const repository = recipientReportRepository(vault);
  const [reports, { refetch }] = createResource(async () => {
    try {
      const rows = await repository.list();
      return rows.sort((a, b) => b.document.savedAt.localeCompare(a.document.savedAt));
    } catch {
      return null;
    }
  });
  const [working, setWorking] = createSignal<string>();
  const [failed, setFailed] = createSignal<string>();
  let job: AbortController | undefined;
  onCleanup(() => job?.abort());
  const find = (project: string, invitation: string) =>
    reports()?.find(
      ({ document }) => document.project === project && document.invitation === invitation,
    );

  return {
    reports,
    find,
    async save(document: RecipientReport) {
      const saved = await repository.load(document);
      const revision = await repository.save(saved?.revision ?? 0, document);
      await refetch();
      return revision;
    },
    async remove({ revision, document }: SavedRecipientReport) {
      setFailed(undefined);
      try {
        await repository.remove(document, revision);
      } catch {
        setFailed(document.invitation);
      }
      await refetch();
    },
    working,
    failed,
    async download(document: RecipientReport) {
      if (job) return;
      const task = new AbortController();
      job = task;
      setWorking(document.invitation);
      setFailed(undefined);
      try {
        const signal = AbortSignal.any([task.signal, vault.accessSignal()]);
        const blob = await exportReport(recipientExportDraft(document), signal);
        signal.throwIfAborted();
        const url = URL.createObjectURL(blob);
        const link = window.document.createElement('a');
        link.href = url;
        link.download = 'calirestore-recipient-draft.' + document.settings.format.toLowerCase();
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1500);
      } catch {
        if (!task.signal.aborted) setFailed(document.invitation);
      } finally {
        job = undefined;
        setWorking(undefined);
      }
    },
  };
}

export type RecipientReports = ReturnType<typeof useRecipientReports>;
