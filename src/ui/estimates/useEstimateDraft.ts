import { createSignal, onMount } from 'solid-js';
import type { LocalVault } from '../../../platform/vault/vault';
import type { EstimateInput, EstimateSnapshot } from '../../../platform/estimates/types';
import { calculate } from '../../../platform/estimates/calculate';
import { snapshot as makeSnapshot } from '../../../platform/estimates/snapshots';
import { estimateRepository } from '../../../platform/estimates/persistence';
import type { SavedProject } from '../../../platform/projects/types';
import type { EstimateCopy } from '../../../platform/estimates/copy';
import { createPhases, extraRate, phaseValid } from './estimate-model';
import type { Adjustment, Extra, Phase } from './estimate-model';
import { validDecimal } from './fields';
import { usePhaseMeasurements } from './usePhaseMeasurements';

/** The estimate being edited: inputs, live result, validity and saved versions. */
export function useEstimateDraft(
  project: () => SavedProject,
  vault: () => LocalVault,
  copy: () => EstimateCopy,
) {
  const model = createPhases(() => (project().settings.units === 'imperial' ? 'ft²' : 'm²'));
  const measuring = usePhaseMeasurements(project, vault, model);
  const [selection, setSelection] = createSignal<'whole' | 'selected'>('whole');
  const [objects, setObjects] = createSignal<string[]>([]);
  const [extras, setExtras] = createSignal<Extra[]>([]);
  const [adjustments, setAdjustments] = createSignal<Adjustment[]>([]);
  const [taxed, setTaxed] = createSignal(false);
  const [tax, setTax] = createSignal('');
  const [assumptions, setAssumptions] = createSignal('');
  const [versions, setVersions] = createSignal<EstimateSnapshot[]>([]);
  const [storedRevision, setStoredRevision] = createSignal(0);
  const [ready, setReady] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [status, setStatus] = createSignal('');
  const [priceCurrency, setPriceCurrency] = createSignal(project().settings.currency);
  const [version, setVersion] = createSignal('');
  const scoped = () =>
    project().objects.filter((object) => selection() === 'whole' || objects().includes(object.id));
  const selectedPhases = () =>
    model
      .active()
      .filter(
        (phase) =>
          !phase.surface ||
          scoped().some((object) =>
            object.surfaces.some((surface) => surface.id === phase.surface),
          ),
      );
  const selectedExtras = () =>
    extras().filter(
      (extra) =>
        extra.included && (!extra.object || scoped().some((object) => object.id === extra.object)),
    );
  const input = (): EstimateInput => ({
    schema: 1,
    project: project().id,
    revision: project().revision,
    currency: project().settings.currency,
    priceCurrency: priceCurrency(),
    objects: project().objects.map((o) => ({
      id: o.id,
      name: o.name,
      surfaces: o.surfaces.map((s) => s.id),
    })),
    selected: scoped().map((o) => o.id),
    phases: JSON.parse(
      JSON.stringify(
        model.rows.map((phase) =>
          measuring() ? { ...phase, measurement: 'missing', quantity: undefined } : phase,
        ),
      ),
    ) as Phase[],
    extras: extras(),
    adjustments: adjustments(),
    tax: { enabled: taxed(), rate: tax() },
    assumptions: assumptions(),
  });
  const result = () => {
    try {
      return calculate(input());
    } catch {
      return undefined;
    }
  };
  onMount(async () => {
    try {
      const saved = await estimateRepository(vault()).load(project().id);
      if (saved) {
        const draft = saved.document.draft;
        model.replace(draft.phases);
        setExtras(draft.extras);
        setAdjustments(draft.adjustments);
        setSelection('selected');
        setObjects(draft.selected);
        setTaxed(draft.tax.enabled);
        setTax(draft.tax.rate);
        setAssumptions(draft.assumptions);
        setPriceCurrency(draft.priceCurrency);
        setVersions(saved.document.snapshots);
        setStoredRevision(saved.revision);
        setVersion(String(saved.document.snapshots.length));
      }
      setReady(true);
    } catch {
      setStatus(copy().saveFailed);
    }
  });
  /** Which steps hold a field that blocks saving. */
  const complete = {
    objects: () => scoped().length > 0,
    phases: () => !measuring() && selectedPhases().every(phaseValid),
    extras: () =>
      selectedExtras().every(
        (extra) =>
          !!extra.name.trim() &&
          validDecimal(extraRate(extra)) &&
          validDecimal(extra.hours, 0, undefined, extra.method === 'hourly'),
      ),
    adjustments: () =>
      adjustments().every((row) => !!row.name.trim() && validDecimal(row.percent, -100, 100)) &&
      (!taxed() || validDecimal(tax(), 0, 100)),
  };
  const valid = () =>
    ready() &&
    !busy() &&
    !!result() &&
    (selectedPhases().length > 0 || selectedExtras().length > 0) &&
    complete.objects() &&
    complete.phases() &&
    complete.extras() &&
    complete.adjustments();
  async function capture(issued = false) {
    if (!valid()) return;
    setBusy(true);
    setStatus('');
    try {
      const draft = input();
      const next = [...versions(), makeSnapshot(draft, versions().length + 1, issued)];
      const revision = await estimateRepository(vault()).save(project().id, storedRevision(), {
        schema: 1,
        draft,
        snapshots: next,
      });
      setStoredRevision(revision);
      setVersions(next);
      setVersion(String(next.length));
      setStatus(copy().saved);
    } catch {
      setStatus(copy().saveFailed);
    } finally {
      setBusy(false);
    }
  }
  function reprice() {
    for (const phase of model.rows) model.update(phase.id, { rate: {}, material: '' });
    setExtras((rows) => rows.map((row) => ({ ...row, rate: {} })));
    setPriceCurrency(project().settings.currency);
  }
  return {
    model,
    measuring,
    selection,
    setSelection,
    objects,
    setObjects,
    extras,
    setExtras,
    adjustments,
    setAdjustments,
    taxed,
    setTaxed,
    tax,
    setTax,
    assumptions,
    setAssumptions,
    versions,
    version,
    setVersion,
    status,
    priceCurrency,
    scoped,
    result,
    complete,
    valid,
    capture,
    reprice,
  };
}
export type EstimateDraft = ReturnType<typeof useEstimateDraft>;
