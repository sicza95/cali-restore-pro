import { createSignal, For, Show } from 'solid-js';
import type { LocalVault } from '../../../platform/vault/vault';
import type { SavedProject } from '../../../platform/projects/types';
import type { Language } from '../types';
import { estimateCopy } from '../../../platform/estimates/copy';
import { formatNumber, formatPercent } from '../../../platform/format/number';
import { financeControl as id } from './estimate-controls';
import { Adjustments, Extras } from './FinancialInputs';
import { ReviewCheck, ReviewSelect } from './fields';
import { WorkPhases } from './WorkPhases';
import { PresetInputs } from './PresetInputs';
import { EstimateSummary } from './EstimateSummary';
import { EstimateIssue, EstimateIssueActions } from './EstimateIssue';
import { EstimateStepNav, EstimateStepPanel, focusStep } from './EstimateSteps';
import type { EstimateStep } from './EstimateSteps';
import { useEstimateDraft } from './useEstimateDraft';

export function EstimateReview(props: {
  vault: LocalVault;
  project: SavedProject;
  language: Language;
  navigate: (href: string) => void;
}) {
  const c = () => estimateCopy[props.language];
  const project = () => props.project;
  const d = useEstimateDraft(project, () => props.vault, c);
  const model = d.model;
  const [step, setStep] = createSignal<EstimateStep>('objects');
  const go = (next: EstimateStep) => {
    setStep(next);
    focusStep(next);
  };
  const count = (n: number, words: (n: number, shown: string) => string) =>
    n ? words(n, formatNumber(n, props.language, 0)) : c().none;
  const latest = () => d.versions()[d.versions().length - 1];
  const state = (key: EstimateStep): string => {
    switch (key) {
      case 'objects':
        return d.selection() === 'whole' ? c().whole : count(d.scoped().length, c().objectCount);
      case 'phases':
        return count(model.active().length, c().phaseCount);
      case 'extras':
        return count(d.extras().filter((row) => row.included).length, c().extraCount);
      case 'adjustments': {
        const rows = count(d.adjustments().length, c().adjustmentCount);
        return d.taxed()
          ? rows + ' · ' + c().taxTotal + ' ' + formatPercent(d.tax(), props.language)
          : rows;
      }
      case 'issue': {
        const saved = latest();
        if (!saved) return c().notSaved;
        return (
          c().versionName(saved.version) + ' · ' + (saved.issued ? c().issuedState : c().savedState)
        );
      }
    }
  };
  const incomplete = (key: EstimateStep) => key !== 'issue' && !d.complete[key]();
  return (
    <div class="review-flow estimate-review">
      <Show when={d.priceCurrency() !== project().settings.currency}>
        <p role="alert">{c().reprice}</p>
        <button type="button" onClick={d.reprice}>
          {c().newPrices}
        </button>
      </Show>
      <EstimateSummary
        copy={c()}
        language={props.language}
        currency={project().settings.currency}
        result={d.result()}
        latest={latest()}
        status={d.status()}
      />
      <EstimateStepNav copy={c()} current={step()} state={state} incomplete={incomplete} go={go} />
      <EstimateStepPanel copy={c()} current={step()} go={go} step="objects">
        <section class="project-pane">
          <h2>{c().selection}</h2>
          <p>
            {c().currency} · <strong>{project().settings.currency}</strong>
          </p>
          <ReviewSelect
            id={id('selection')}
            label={c().choose}
            value={d.selection()}
            options={['whole', 'selected']}
            text={(key) => c()[key]}
            change={d.setSelection}
          />
          <Show when={d.selection() === 'selected'}>
            <For each={project().objects}>
              {(object) => (
                <ReviewCheck
                  id={id('choose')}
                  checked={d.objects().includes(object.id)}
                  change={(selected) =>
                    d.setObjects((previous) =>
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
      </EstimateStepPanel>
      <EstimateStepPanel copy={c()} current={step()} go={go} step="phases">
        <div class="review-grid">
          <WorkPhases
            copy={c()}
            language={props.language}
            project={project()}
            model={model}
            navigate={props.navigate}
            measuring={d.measuring()}
          />
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
        </div>
      </EstimateStepPanel>
      <EstimateStepPanel copy={c()} current={step()} go={go} step="extras">
        <Extras
          copy={c()}
          rows={d.extras()}
          objects={project().objects}
          currency={project().settings.currency}
          add={() =>
            d.setExtras((rows) => [
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
            d.setExtras((rows) => rows.map((row) => (row.id === id ? { ...row, ...change } : row)))
          }
          remove={(id) => d.setExtras((rows) => rows.filter((row) => row.id !== id))}
        />
      </EstimateStepPanel>
      <EstimateStepPanel copy={c()} current={step()} go={go} step="adjustments">
        <Adjustments
          copy={c()}
          rows={d.adjustments()}
          taxed={d.taxed()}
          taxRate={d.tax()}
          add={() =>
            d.setAdjustments((rows) => [
              ...rows,
              { id: crypto.randomUUID(), name: '', percent: '' },
            ])
          }
          update={(id, change) =>
            d.setAdjustments((rows) =>
              rows.map((row) => (row.id === id ? { ...row, ...change } : row)),
            )
          }
          remove={(id) => d.setAdjustments((rows) => rows.filter((row) => row.id !== id))}
          setTaxed={d.setTaxed}
          setTaxRate={d.setTax}
        />
      </EstimateStepPanel>
      <EstimateStepPanel
        current={step()}
        go={go}
        copy={c()}
        step="issue"
        primary={<EstimateIssueActions copy={c()} draft={d} />}
      >
        <EstimateIssue copy={c()} language={props.language} draft={d} />
      </EstimateStepPanel>
    </div>
  );
}
