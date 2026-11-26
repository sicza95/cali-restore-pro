import { createSignal, onCleanup, onMount, untrack } from 'solid-js';
import { createStore, reconcile, unwrap } from 'solid-js/store';
import { estimateRepository } from '../../platform/estimates/persistence';
import type { EstimateSnapshot } from '../../platform/estimates/types';
import { finalReportBlock, issueReport } from '../../platform/reports/issuance';
import { coversEstimate, reportEstimate } from '../../platform/reports/estimate';
import { reportRepository } from '../../platform/reports/persistence';
import { workbookEstimate } from '../../platform/reports/workbook-estimate';
import type { Branding, Draft, ReportIssuance, ReportSettings } from '../../platform/reports/types';
import type { SavedProject } from '../../platform/projects/types';
import type { LocalVault } from '../../platform/vault/vault';
import { loadAccountSettings } from '../settings/preferences/utils';
import { reportDefaults, resolveReportBranding } from '../../platform/reports/settings';
import { reportLogo } from '../../platform/reports/logo';
import { resolveReportSurfaceUnits } from '../../platform/reports/surface-settings';
import type { SettingsTarget } from '../../platform/projects/settings';
import { prepareSurfaces, selectedSurfaces } from './report-model';

export function useReport(props: {
  project: SavedProject;
  vault: LocalVault;
  account: string;
  target?: SettingsTarget;
}) {
  const accountDefaults = () => loadAccountSettings(props.account);
  const inherited = () => reportDefaults(accountDefaults(), props.project, props.target);
  // Keep the report-specific editor's existing flat branding interface.
  const defaults = {
    get studio() {
      return inherited().branding.studio.value;
    },
    get contact() {
      return inherited().branding.contact.value;
    },
    get footer() {
      return inherited().branding.footer.value;
    },
    get accent() {
      return inherited().branding.accent.value;
    },
    get logo() {
      const logo = inherited().branding.logo.value;
      return logo && 'accountDataUrl' in logo ? logo.accountDataUrl : '';
    },
  };
  const projectId = untrack(() => props.project.id);
  const { reports, estimates } = untrack(() => ({
    reports: reportRepository(props.vault),
    estimates: estimateRepository(props.vault),
  }));
  const [settings, set] = createStore<ReportSettings>({
    language: untrack(() => inherited().restoration.reportLanguage.value),
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
  });
  const [brand, setBrand] = createSignal<Branding>();
  const [issued, setIssued] = createSignal<EstimateSnapshot[]>([]);
  const [preparing, setPreparing] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [ready, setReady] = createSignal(false);
  const [status, setStatus] = createSignal<
    'saved' | 'loadError' | 'saveError' | 'estimateError' | 'previewError'
  >();
  const [savedIssuance, setSavedIssuance] = createSignal<ReportIssuance>();
  const [savedRevision, setSavedRevision] = createSignal<number>();
  let revision = 0;
  let mounted = true;
  let attempt = 0;
  let controller: AbortController | undefined;
  onCleanup(() => {
    mounted = false;
    controller?.abort();
  });

  async function open() {
    if (busy()) return;
    setBusy(true);
    setStatus(undefined);
    const [draft, estimate] = await Promise.allSettled([
      reports.load(projectId),
      estimates.load(projectId),
    ]);
    if (!mounted) return;
    if (draft.status === 'fulfilled') {
      const saved = draft.value;
      if (saved) {
        set(reconcile(saved.document.settings));
        setBrand(saved.document.settings.branding);
      }
      revision = saved?.revision ?? 0;
      setSavedRevision(saved?.document.projectRevision);
      setSavedIssuance(saved?.document.issuance);
      setReady(true);
      if (estimate.status === 'fulfilled') {
        const snapshots = estimate.value?.document.snapshots ?? [];
        setIssued(snapshots);
        // Default to the newest issued version; a draft only when none is issued.
        const preferred = snapshots.filter(({ issued }) => issued).at(-1) ?? snapshots.at(-1);
        if (!saved) set('estimate', preferred?.id ?? '');
      } else setStatus('estimateError');
    } else setStatus('loadError');
    setBusy(false);
  }
  onMount(() => void open());

  async function readSettings(signal: AbortSignal, preserveIssued = false) {
    const value = structuredClone(unwrap(settings));
    if (!preserveIssued) value.branding = brand();
    value.branding = await resolveReportBranding(
      accountDefaults(),
      props.project,
      value,
      props.target,
      (id) => reportLogo(props.vault, props.project.id, id, signal),
      preserveIssued,
    );
    return value;
  }

  async function save() {
    if (!ready() || busy()) return;
    setBusy(true);
    setStatus(undefined);
    const projectRevision = props.project.revision;
    try {
      revision = await reports.save(projectId, revision, {
        schema: 1,
        project: projectId,
        projectRevision,
        savedAt: new Date().toISOString(),
        settings: await readSettings(props.vault.accessSignal()),
      });
      if (mounted) {
        setSavedRevision(projectRevision);
        setStatus('saved');
        setSavedIssuance(undefined);
      }
    } catch {
      if (mounted) setStatus('saveError');
    } finally {
      if (mounted) setBusy(false);
    }
  }

  function cancel() {
    if (!preparing()) return;
    attempt++;
    controller?.abort();
    setPreparing(false);
    setBusy(false);
  }

  async function preview(show: (draft: Draft) => void, final = false) {
    if (!ready() || busy()) return;
    const project = structuredClone(unwrap(props.project));
    const { name, revision: projectRevision, updatedAt } = project;
    const token = ++attempt;
    const job = new AbortController();
    controller = job;
    const signal = AbortSignal.any([job.signal, props.vault.accessSignal()]);
    setPreparing(true);
    setBusy(true);
    setStatus(undefined);
    try {
      const selection = await readSettings(signal, !!savedIssuance() && !final);
      const surfaces = resolveReportSurfaceUnits(
        accountDefaults(),
        project,
        selection,
        selectedSurfaces(project, selection),
      );
      if (!surfaces.length) return;
      const draft: Draft = {
        project: { name, revision: projectRevision, updatedAt },
        surfaces,
        language: selection.language,
        content: selection.content,
        notes: selection.notes,
        branding: selection.branding,
        format: selection.format,
        resolution:
          selection.format === 'PDF' || selection.format === 'PNG'
            ? selection.resolution
            : undefined,
        workbook: selection.format === 'XLSX' ? 'snapshot' : undefined,
      };
      await prepareSurfaces(project, selection, surfaces, props.vault, signal);
      if (selection.finances !== 'none') {
        const saved = await estimates.load(projectId);
        const snapshot = saved?.document.snapshots.find(({ id }) => id === selection.estimate);
        setIssued(saved?.document.snapshots ?? []);
        if (final && finalReportBlock(snapshot, surfaces, selection.finances))
          throw new Error('Final issuance blocked');
        if (!snapshot) draft.estimateState = 'unavailable';
        else if (!coversEstimate(snapshot, surfaces)) draft.estimateState = 'outsideScope';
        else {
          const changed = JSON.stringify(snapshot.input) !== JSON.stringify(saved?.document.draft);
          draft.estimate = reportEstimate(
            { scope: 'estimate-full', snapshot },
            selection.finances,
            projectRevision,
            changed,
          );
          if (final) draft.issuance = issueReport(draft, snapshot);
          if (
            selection.format === 'XLSX' &&
            selection.workbook === 'editable' &&
            draft.estimate.detail
          ) {
            draft.workbook = 'editable';
            draft.workbookEstimate = workbookEstimate(snapshot, surfaces);
          }
        }
      }
      if (mounted && token === attempt) {
        signal.throwIfAborted();
        if (props.project.revision !== projectRevision) throw new Error('Project changed');
        if (final) {
          if (!draft.issuance) throw new Error('Final issuance blocked');
          revision = await reports.save(projectId, revision, {
            schema: 1,
            project: projectId,
            projectRevision: project.revision,
            savedAt: draft.issuance.issuedAt,
            settings: selection,
            issuance: draft.issuance,
          });
          if (!mounted || token !== attempt) return;
          signal.throwIfAborted();
          if (props.project.revision !== project.revision) throw new Error('Project changed');
          setSavedRevision(project.revision);
          setSavedIssuance(draft.issuance);
          set('branding', selection.branding);
        }
        show(draft);
      }
    } catch {
      if (mounted && token === attempt) setStatus('previewError');
    } finally {
      if (mounted && token === attempt) {
        setPreparing(false);
        setBusy(false);
      }
    }
  }
  return {
    defaults,
    settings,
    set,
    brand,
    setBrand,
    issued,
    preparing,
    ready,
    busy,
    status,
    savedRevision,
    savedIssuance,
    open,
    save,
    preview,
    cancel,
  };
}
