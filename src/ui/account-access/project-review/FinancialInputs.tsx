import { For, Show } from 'solid-js';
import type { RestorationObject } from '../../../platform/projects/types';
import type { EstimateCopy } from '../../../platform/estimates/copy';
import { financeControl as id } from './estimate-controls';
import { extraRate } from './estimate-model';
import type { Adjustment, Extra } from './estimate-model';
import { ReviewCheck, ReviewNumber, ReviewSelect } from './fields';

export function Extras(props: {
  copy: EstimateCopy;
  rows: readonly Extra[];
  objects: readonly RestorationObject[];
  currency: string;
  add: () => void;
  update: (id: string, change: Partial<Extra>) => void;
  remove: (id: string) => void;
}) {
  const c = () => props.copy;
  return (
    <section class="project-pane">
      <h3>{c().extras}</h3>
      <For each={props.rows}>
        {(extra) => (
          <div class="review-inset">
            <div class="review-fields">
              <label>
                {c().extraName}
                <input
                  data-control-id={id('extraName')}
                  value={extra.name}
                  maxlength="80"
                  required
                  onInput={(e) => props.update(extra.id, { name: e.currentTarget.value })}
                />
              </label>
              <ReviewSelect
                id={id('extraScope')}
                label={c().extraScope}
                options={['', ...props.objects.map(({ id }) => id)]}
                value={extra.object}
                text={(key) => props.objects.find(({ id }) => id === key)?.name ?? c().projectExtra}
                change={(object) => props.update(extra.id, { object })}
              />
              <ReviewSelect
                id={id('extraMethod')}
                label={c().extraMethod}
                options={['fixed', 'hourly']}
                value={extra.method}
                text={(key) => c()[key]}
                change={(method) => props.update(extra.id, { method })}
              />
              <ReviewNumber
                id={id('extraRate')}
                label={
                  c().extraRate + ' · ' + props.currency + (extra.method === 'hourly' ? '/h' : '')
                }
                value={extraRate(extra)}
                error={c().numberHelp}
                change={(rate) =>
                  props.update(extra.id, { rate: { ...extra.rate, [extra.method]: rate } })
                }
              />
              <ReviewNumber
                id={id('extraHours')}
                label={c().extraHours + ' · h'}
                value={extra.hours}
                optional={extra.method === 'fixed'}
                error={c().numberHelp}
                change={(hours) => props.update(extra.id, { hours })}
              />
            </div>
            <div class="review-actions">
              <ReviewCheck
                id={id('includeExtra')}
                checked={extra.included}
                change={(included) => props.update(extra.id, { included })}
              >
                {c().includeExtra}
              </ReviewCheck>
              <button
                type="button"
                class="secondary"
                data-control-id={id('removeExtra')}
                onClick={() => props.remove(extra.id)}
              >
                {c().removeExtra}
              </button>
            </div>
          </div>
        )}
      </For>
      <button
        type="button"
        class="secondary"
        data-control-id={id('newExtra')}
        onClick={() => props.add()}
      >
        {c().newExtra}
      </button>
    </section>
  );
}

export function Adjustments(props: {
  copy: EstimateCopy;
  rows: readonly Adjustment[];
  taxed: boolean;
  taxRate: string;
  add: () => void;
  update: (id: string, change: Partial<Adjustment>) => void;
  remove: (id: string) => void;
  setTaxed: (enabled: boolean) => void;
  setTaxRate: (rate: string) => void;
}) {
  const c = () => props.copy;
  return (
    <section class="project-pane">
      <h3>{c().adjustments}</h3>
      <For each={props.rows}>
        {(row) => (
          <div class="review-inset review-fields">
            <label>
              {c().adjustmentName}
              <input
                data-control-id={id('adjustmentName')}
                value={row.name}
                maxlength="80"
                required
                onInput={(e) => props.update(row.id, { name: e.currentTarget.value })}
              />
            </label>
            <ReviewNumber
              id={id('adjustmentPercent')}
              label={c().adjustmentPercent}
              value={row.percent}
              min={-100}
              max={100}
              error={c().percentHelp}
              change={(percent) => props.update(row.id, { percent })}
            />
            <button
              type="button"
              class="secondary"
              data-control-id={id('removeAdjustment')}
              onClick={() => props.remove(row.id)}
            >
              {c().removeAdjustment}
            </button>
          </div>
        )}
      </For>
      <button
        type="button"
        class="secondary"
        data-control-id={id('newAdjustment')}
        onClick={() => props.add()}
      >
        {c().newAdjustment}
      </button>
      <ReviewCheck id={id('tax')} checked={props.taxed} change={props.setTaxed}>
        {c().tax}
      </ReviewCheck>
      <Show when={props.taxed}>
        <ReviewNumber
          id={id('taxPercent')}
          label={c().taxPercent}
          value={props.taxRate}
          max={100}
          error={c().taxHelp}
          change={props.setTaxRate}
        />
      </Show>
    </section>
  );
}
