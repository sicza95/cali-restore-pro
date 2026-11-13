import { createSignal, onCleanup, onMount, untrack } from 'solid-js';
import { createStore, reconcile, unwrap } from 'solid-js/store';
import { estimateRepository } from '../../../platform/estimates/persistence';
import { coversEstimate, reportEstimate } from '../../../platform/reports/estimate';
import { reportRepository } from '../../../platform/reports/persistence';
import type { Branding, ReportSettings } from '../../../platform/reports/types';
import type { SavedProject } from '../../../platform/projects/types';
import type { LocalVault } from '../../../platform/vault/vault';
import { loadPreferences } from '../settings/preferences/utils';
import { selectedSurfaces } from './report-model';
import type { Draft } from './report-model';

export function useReport(props: { project: SavedProject; vault: LocalVault; account: string }) {
  const defaults = untrack(() => loadPreferences(props.account));
  const projectId = untrack(() => props.project.id);
  const { reports, estimates } = untrack(() => ({
    reports: reportRepository(props.vault),
    estimates: estimateRepository(props.vault),
  }));
  const [settings, set] = createStore<ReportSettings>({
    language: defaults.reportLanguage === 'hu' ? 'hu' : 'en',
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
  const [issued, setIssued] = createSignal<{ id: string; version: number }[]>([]);
  const [preparing, setPreparing] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [ready, setReady] = createSignal(false);
  const [status, setStatus] = createSignal<
    'saved' | 'loadError' | 'saveError' | 'estimateError' | 'previewError'
  >();
  const [savedRevision, setSavedRevision] = createSignal<number>();
  let revision = 0;
  let mounted = true;
  let attempt = 0;
  onCleanup(() => {
    mounted = false;
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
      setReady(true);
      if (estimate.status === 'fulfilled') {
        const snapshots = estimate.value?.document.snapshots.filter(({ issued }) => issued) ?? [];
        setIssued(snapshots.map(({ id, version }) => ({ id, version })));
        if (!saved) set('estimate', snapshots.at(-1)?.id ?? '');
      } else setStatus('estimateError');
    } else setStatus('loadError');
    setBusy(false);
  }
  onMount(() => void open());

  function effectiveBranding() {
    if (settings.brandingSource === 'omit') return;
    const source = brand() ?? defaults;
    return {
      studio: source.studio,
      contact: source.contact,
      footer: source.footer,
      accent: /^#[a-f0-9]{6}$/i.test(source.accent) ? source.accent : '#000000',
      logo: /^data:image\/png;base64,[a-z0-9+/=]+$/i.test(source.logo) ? source.logo : '',
    };
  }

  function readSettings() {
    return { ...structuredClone(unwrap(settings)), branding: effectiveBranding() };
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
        settings: readSettings(),
      });
      if (mounted) {
        setSavedRevision(projectRevision);
        setStatus('saved');
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
    setPreparing(false);
    setBusy(false);
  }

  async function preview(show: (draft: Draft) => void) {
    if (!ready() || busy()) return;
    const selection = readSettings();
    const { name, revision, updatedAt } = props.project;
    const surfaces = selectedSurfaces(props.project, selection);
    if (!surfaces.length) return;
    const token = ++attempt;
    setPreparing(true);
    setBusy(true);
    setStatus(undefined);
    const draft: Draft = {
      project: { name, revision, updatedAt },
      surfaces,
      language: selection.language,
      content: selection.content,
      notes: selection.notes,
      branding: selection.branding,
      format: selection.format,
      resolution:
        selection.format === 'PDF' || selection.format === 'PNG' ? selection.resolution : undefined,
      workbook: selection.format === 'XLSX' ? 'snapshot' : undefined,
    };
    try {
      if (selection.finances !== 'none') {
        const saved = await estimates.load(projectId);
        const snapshot = saved?.document.snapshots.find(
          ({ id, issued }) => id === selection.estimate && issued,
        );
        if (!snapshot) draft.estimateState = 'unavailable';
        else if (!coversEstimate(snapshot, surfaces)) draft.estimateState = 'outsideScope';
        else {
          const changed = JSON.stringify(snapshot.input) !== JSON.stringify(saved?.document.draft);
          draft.estimate = reportEstimate(
            { scope: 'estimate-full', snapshot },
            selection.finances,
            revision,
            changed,
          );
          if (selection.format === 'XLSX' && draft.estimate.detail)
            draft.workbook = selection.workbook;
        }
      }
      if (mounted && token === attempt) {
        if (props.project.revision !== revision) throw new Error('Project changed');
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
    open,
    save,
    preview,
    cancel,
  };
}
