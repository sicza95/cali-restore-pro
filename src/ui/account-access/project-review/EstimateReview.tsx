import { createSignal, For, Show } from 'solid-js';
import type { SavedProject } from '../../../platform/projects/types';
import type { Language } from '../types';
import { estimateCopy } from './estimate-copy';
import { financeControl as id } from './estimate-controls';
import {
  copyPhase,
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

type Snapshot = {
  currency: string;
  revision: number;
  objects: string[];
  phases: Phase[];
  extras: Extra[];
  adjustments: Adjustment[];
  tax: string | null;
  assumptions: string;
};

export function EstimateReview(props: {
  project: SavedProject;
  language: Language;
  navigate: (href: string) => void;
}) {
  const c = () => estimateCopy[props.language];
  const project = () => props.project;
  const model = createPhases(() => (project().settings.units === 'imperial' ? 'ft²' : 'm²'));
  const [selection, setSelection] = createSignal<'whole' | 'selected'>('whole');
  const [objects, setObjects] = createSignal<string[]>([]);
  const [extras, setExtras] = createSignal<Extra[]>([]);
  const [adjustments, setAdjustments] = createSignal<Adjustment[]>([]);
  const [taxed, setTaxed] = createSignal(false);
  const [tax, setTax] = createSignal('');
  const [assumptions, setAssumptions] = createSignal('');
  const [versions, setVersions] = createSignal<Snapshot[]>([]);
  const [version, setVersion] = createSignal('');
  const currency = () => project().settings.currency;
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
  const snapshot = () => versions()[Number(version()) - 1];
  const valid = () =>
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
  function capture() {
    if (!valid()) return;
    setVersions((previous) => [
      ...previous,
      {
        currency: currency(),
        revision: project().revision,
        objects: scoped().map(({ name }) => name),
        phases: selectedPhases().map(copyPhase),
        extras: selectedExtras().map((row) => ({ ...row, rate: { ...row.rate } })),
        adjustments: adjustments().map((row) => ({ ...row })),
        tax: taxed() ? tax() : null,
        assumptions: assumptions(),
      },
    ]);
    setVersion(String(versions().length));
  }
  return (
    <div class="review-flow estimate-review">
      <p class="review-note">{c().transient}</p>
      <div class="review-grid">
        <WorkPhases copy={c()} project={project()} model={model} navigate={props.navigate} />
        <div class="review-flow">
          <section class="project-pane">
            <h3>{c().selection}</h3>
            <p>
              {c().currency} · <strong>{currency()}</strong>
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
                    <dd>—</dd>
                  </>
                )}
              </For>
            </dl>
            <p class="review-note">{c().unavailable}</p>
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
                onClick={capture}
              >
                {c().snapshot}
              </button>
              <button type="button" class="secondary" data-control-id={id('issue')} disabled>
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
                    <p>{item().objects.join(' · ')}</p>
                    <ul>
                      <For each={item().phases}>
                        {(phase) => (
                          <li>
                            {phase.name} · {c()[phase.price]} · {phaseRate(phase)}{' '}
                            {phaseRateUnit(phase, item().currency)} · {c()[phase.mode]}{' '}
                            {phaseEffort(phase)} · ×{phase.multiplier}
                          </li>
                        )}
                      </For>
                      <For each={item().extras}>
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
                    <Show when={item().tax !== null}>
                      <p>
                        {c().taxTotal} · {item().tax}%
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
          currency={currency()}
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
