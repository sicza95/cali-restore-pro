import { createSignal, For, Show, onMount } from 'solid-js';
import type { LocalVault } from '../../../platform/vault/vault';
import type { EstimateInput, EstimateSnapshot } from '../../../platform/estimates/types';
import { calculate } from '../../../platform/estimates/calculate';
import { snapshot as makeSnapshot } from '../../../platform/estimates/snapshots';
import { estimateRepository } from '../../../platform/estimates/persistence';
import type { SavedProject } from '../../../platform/projects/types';
import type { Language } from '../types';
import { estimateCopy } from '../../../platform/estimates/copy';
import { financeControl as id } from './estimate-controls';
import {
  createPhases,
  extraRate,
  phaseEffort,
  phaseRate,
  phaseRateUnit,
  phaseValid,
} from './estimate-model';
import type { Adjustment, Extra, Phase } from './estimate-model';
import { Adjustments, Extras } from './FinancialInputs';
import { ReviewCheck, ReviewSelect, validDecimal } from './fields';
import { WorkPhases } from './WorkPhases';
import { PresetInputs } from './PresetInputs';
import { quantityText } from '../../../platform/estimates/display';
import { usePhaseMeasurements } from './usePhaseMeasurements';

export function EstimateReview(props: {
  vault: LocalVault;
  project: SavedProject;
  language: Language;
  navigate: (href: string) => void;
}) {
  const c = () => estimateCopy[props.language];
  const project = () => props.project;
  const model = createPhases(() => (project().settings.units === 'imperial' ? 'ft²' : 'm²'));
  const measuring = usePhaseMeasurements(project, () => props.vault, model);
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
  const snapshot = () => versions()[Number(version()) - 1]?.input;
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
      const saved = await estimateRepository(props.vault).load(project().id);
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
      setStatus(c().saveFailed);
    }
  });
  const valid = () =>
    ready() &&
    !busy() &&
    !measuring() &&
    !!result() &&
    scoped().length > 0 &&
    (selectedPhases().length > 0 || selectedExtras().length > 0) &&
    selectedPhases().every(phaseValid) &&
    selectedExtras().every(
      (extra) =>
        !!extra.name.trim() &&
        validDecimal(extraRate(extra)) &&
        validDecimal(extra.hours, 0, undefined, extra.method === 'hourly'),
    ) &&
    adjustments().every((row) => !!row.name.trim() && validDecimal(row.percent, -100, 100)) &&
    (!taxed() || validDecimal(tax(), 0, 100));
  async function capture(issued = false) {
    if (!valid()) return;
    setBusy(true);
    setStatus('');
    try {
      const draft = input();
      const next = [...versions(), makeSnapshot(draft, versions().length + 1, issued)];
      const revision = await estimateRepository(props.vault).save(project().id, storedRevision(), {
        schema: 1,
        draft,
        snapshots: next,
      });
      setStoredRevision(revision);
      setVersions(next);
      setVersion(String(next.length));
      setStatus(c().saved);
    } catch {
      setStatus(c().saveFailed);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div class="review-flow estimate-review">
      <p class="review-note">
        {c().transient} {c().recoveryLimit}
      </p>
      <p role="status">{status()}</p>
      <Show when={priceCurrency() !== project().settings.currency}>
        <p role="alert">{c().reprice}</p>
        <button
          type="button"
          onClick={() => {
            for (const phase of model.rows) model.update(phase.id, { rate: {}, material: '' });
            setExtras((rows) => rows.map((row) => ({ ...row, rate: {} })));
            setPriceCurrency(project().settings.currency);
          }}
        >
          {c().newPrices}
        </button>
      </Show>
      <div class="review-grid">
        <WorkPhases
          copy={c()}
          project={project()}
          model={model}
          navigate={props.navigate}
          measuring={measuring()}
        />
        <div class="review-flow">
          <Show when={model.current()}>
            {(phase) => (
              <PresetInputs
                vault={props.vault}
                language={props.language}
                phase={phase()}
                currency={project().settings.currency}
                update={(next) => model.update(phase().id, next)}
              />
            )}
          </Show>
          <section class="project-pane">
            <h3>{c().selection}</h3>
            <p>
              {c().currency} · <strong>{project().settings.currency}</strong>
            </p>
            <ReviewSelect
              id={id('selection')}
              label={c().choose}
              value={selection()}
              options={['whole', 'selected']}
              text={(key) => c()[key]}
              change={setSelection}
            />
            <Show when={selection() === 'selected'}>
              <For each={project().objects}>
                {(object) => (
                  <ReviewCheck
                    id={id('choose')}
                    checked={objects().includes(object.id)}
                    change={(selected) =>
                      setObjects((previous) =>
                        selected
                          ? [...previous, object.id]
                          : previous.filter((key) => key !== object.id),
                      )
                    }
                  >
                    {object.name}
                  </ReviewCheck>
                )}
              </For>
            </Show>
          </section>
          <section class="project-pane">
            <h3>{c().results}</h3>
            <dl class="review-facts">
              <For each={['hours', 'subtotal', 'beforeTax', 'taxTotal', 'total'] as const}>
                {(key) => (
                  <>
                    <dt>{c()[key]}</dt>
                    <dd data-estimate-result={key}>
                      {key === 'hours' ? quantityText(result()?.hours) : (result()?.[key] ?? '—')}
                    </dd>
                  </>
                )}
              </For>
            </dl>
            <label>
              {c().assumptions}
              <textarea
                data-control-id={id('assumptions')}
                maxlength="1000"
                value={assumptions()}
                onInput={(e) => setAssumptions(e.currentTarget.value)}
              />
            </label>
            <Show when={!valid()}>
              <p>{c().validation}</p>
            </Show>
            <div class="review-actions">
              <button
                type="button"
                data-control-id={id('snapshot')}
                disabled={!valid()}
                onClick={() => void capture()}
              >
                {c().snapshot}
              </button>
              <button
                type="button"
                class="secondary"
                data-control-id={id('issue')}
                disabled={!valid() || !result()?.complete}
                onClick={() => void capture(true)}
              >
                {c().issue}
              </button>
            </div>
            <Show when={versions().length} fallback={<p>{c().noSnapshot}</p>}>
              <ReviewSelect
                id={id('version')}
                label={c().version}
                options={versions().map((_, index) => String(index + 1))}
                value={version()}
                change={setVersion}
              />
              <Show when={snapshot()}>
                {(item) => (
                  <div class="review-inset" role="status">
                    <p>
                      {c().snapshotState} · r{item().revision} · {item().currency}
                    </p>
                    <p>
                      {versions()[Number(version()) - 1]?.result.calculation} · {c().total} ·{' '}
                      {versions()[Number(version()) - 1]?.result.total ?? '—'}
                    </p>
                    <p>
                      {item()
                        .objects.filter((o) => item().selected.includes(o.id))
                        .map((o) => o.name)
                        .join(' · ')}
                    </p>
                    <ul>
                      <For
                        each={item().phases.filter(
                          (p) =>
                            !p.archived &&
                            item().objects.some(
                              (o) =>
                                item().selected.includes(o.id) && o.surfaces.includes(p.surface),
                            ),
                        )}
                      >
                        {(phase) => (
                          <li>
                            {phase.name} · {c()[phase.price]} · {phaseRate(phase)}{' '}
                            {phaseRateUnit(phase, item().currency)} · {c()[phase.mode]}{' '}
                            {phaseEffort(phase)} · ×{phase.multiplier}
                          </li>
                        )}
                      </For>
                      <For
                        each={item().extras.filter(
                          (e) => e.included && (!e.object || item().selected.includes(e.object)),
                        )}
                      >
                        {(extra) => (
                          <li>
                            {extra.name} · {extraRate(extra)}
                          </li>
                        )}
                      </For>
                      <For each={item().adjustments}>
                        {(row) => (
                          <li>
                            {row.name} · {row.percent}%
                          </li>
                        )}
                      </For>
                    </ul>
                    <Show when={item().tax.enabled}>
                      <p>
                        {c().taxTotal} · {item().tax.rate}%
                      </p>
                    </Show>
                    <Show when={item().assumptions}>
                      <p>{item().assumptions}</p>
                    </Show>
                  </div>
                )}
              </Show>
            </Show>
          </section>
        </div>
      </div>
      <div class="review-grid">
        <Extras
          copy={c()}
          rows={extras()}
          objects={project().objects}
          currency={project().settings.currency}
          add={() =>
            setExtras((rows) => [
              ...rows,
              {
                id: crypto.randomUUID(),
                name: '',
                object: '',
                method: 'fixed',
                hours: '',
                rate: {},
                included: true,
              },
            ])
          }
          update={(id, change) =>
            setExtras((rows) => rows.map((row) => (row.id === id ? { ...row, ...change } : row)))
          }
          remove={(id) => setExtras((rows) => rows.filter((row) => row.id !== id))}
        />
        <Adjustments
          copy={c()}
          rows={adjustments()}
          taxed={taxed()}
          taxRate={tax()}
          add={() =>
            setAdjustments((rows) => [...rows, { id: crypto.randomUUID(), name: '', percent: '' }])
          }
          update={(id, change) =>
            setAdjustments((rows) =>
              rows.map((row) => (row.id === id ? { ...row, ...change } : row)),
            )
          }
          remove={(id) => setAdjustments((rows) => rows.filter((row) => row.id !== id))}
          setTaxed={setTaxed}
          setTaxRate={setTax}
        />
      </div>
    </div>
  );
}
