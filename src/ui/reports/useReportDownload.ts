import { createSignal, onCleanup } from 'solid-js';
import { exportReport } from '../../platform/reports/export';
import type { ReportExport } from '../../platform/reports/export';
import type { LocalVault } from '../../platform/vault/vault';

export function useReportDownload(vault: () => LocalVault, current: () => boolean) {
  const [working, setWorking] = createSignal(false);
  const [failed, setFailed] = createSignal(false);
  let job: AbortController | undefined;
  let url: string | undefined;
  let release: ReturnType<typeof setTimeout> | undefined;

  function revoke() {
    if (release !== undefined) clearTimeout(release);
    if (url) URL.revokeObjectURL(url);
    url = undefined;
  }

  function cancel() {
    job?.abort();
    job = undefined;
    setWorking(false);
    setFailed(false);
    revoke();
  }
  onCleanup(cancel);

  async function download(input: ReportExport | (() => ReportExport)) {
    if (job) return;
    const task = new AbortController();
    job = task;
    setWorking(true);
    setFailed(false);
    try {
      if (!current()) throw new Error('Project changed');
      const signal = AbortSignal.any([task.signal, vault().accessSignal()]);
      signal.throwIfAborted();
      const draft = typeof input === 'function' ? input() : input;
      const blob = await exportReport(draft, signal);
      signal.throwIfAborted();
      if (!current()) throw new Error('Project changed');
      revoke();
      url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download =
        'kind' in draft
          ? 'calirestore-raw-mask.png'
          : 'calirestore-report-' +
            (draft.issuance ? 'final.' : 'draft.') +
            draft.format.toLowerCase();
      link.click();
      release = setTimeout(revoke, 1500);
    } catch {
      if (job === task && !task.signal.aborted) setFailed(true);
    } finally {
      if (job === task) {
        job = undefined;
        setWorking(false);
      }
    }
  }
  return { download, working, failed, cancel };
}
