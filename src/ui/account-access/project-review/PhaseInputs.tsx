import { Show } from 'solid-js';
import {
  estimateUnits,
  methods,
  modes,
  phaseRate,
  phaseRateKey,
  phaseRateUnit,
  smallestPositive,
} from './estimate-model';
import type { Phase } from './estimate-model';
import type { EstimateCopy } from './estimate-copy';
import { phaseControl as id } from './estimate-controls';
import { ReviewNumber, ReviewSelect, validDecimal } from './fields';

const measurements = ['missing', 'stale', 'ready'] as const;

export function PhaseInputs(props: {
  copy: EstimateCopy;
  phase: Phase;
  currency: string;
  update: (value: Partial<Phase>) => void;
}) {
  const c = () => props.copy;
  const p = () => props.phase;
  const time = () => p().mode === 'time';
  const update = (value: Partial<Phase>) => props.update(value);
  const multiplier = () => p().factorDraft ?? p().multiplier;
  return (
    <>
      <h4>{c().breakdown}</h4>
      <div class="review-fields">
        <ReviewSelect
          id={id('measurement')}
          label={c().measurement}
          value={p().measurement}
          options={measurements}
          text={(key) => c()[key]}
          change={(measurement) => update({ measurement })}
        />
        <Show when={p().measurement === 'stale'}>
          <button
            type="button"
            class="secondary"
            data-control-id={id('acknowledge')}
            onClick={() => update({ measurement: 'ready' })}
          >
            {c().acknowledge}
          </button>
        </Show>
        <ReviewSelect
          id={id('units')}
          label={c().units}
          value={p().units}
          options={estimateUnits}
          change={(units) => update({ units })}
        />
        <ReviewSelect
          id={id('mode')}
          label={c().mode}
          value={p().mode}
          options={modes}
          text={(key) => c()[key]}
          change={(mode) => update({ mode, factorDraft: undefined })}
        />
      </div>
      <div class="review-fields">
        <Show
          when={time()}
          fallback={
            <>
              <ReviewNumber
                id={id('productivity')}
                label={c().productivity + ' · ' + p().units + '/h'}
                value={p().productivity[p().units] ?? ''}
                min={smallestPositive}
                error={c().multiplierHelp}
                change={(productivity) =>
                  update({ productivity: { ...p().productivity, [p().units]: productivity } })
                }
              />
              <ReviewNumber
                id={id('hoursOutput')}
                label={c().hoursOutput + ' · h'}
                value="—"
                error=""
                readOnly
                change={() => undefined}
              />
            </>
          }
        >
          <ReviewNumber
            id={id('time')}
            label={c().time + ' · h'}
            value={p().time}
            error={c().numberHelp}
            change={(time) => update({ time })}
          />
          <ReviewNumber
            id={id('productivityOutput')}
            label={c().productivityOutput + ' · ' + p().units + '/h'}
            value="—"
            error=""
            readOnly
            change={() => undefined}
          />
        </Show>
        <ReviewNumber
          id={id('multiplier')}
          label={c().multiplier}
          value={multiplier()}
          min={smallestPositive}
          error={c().multiplierHelp}
          change={(value) =>
            time() && p().time.trim()
              ? update({ factorDraft: value === p().multiplier ? undefined : value })
              : update({ multiplier: value })
          }
        />
      </div>
      <Show when={p().factorDraft !== undefined}>
        <section
          class="review-inset"
          aria-label={c().factorReview}
          data-control-id={id('factorReview')}
        >
          <p>{c().factorHelp}</p>
          <div class="review-actions">
            <button
              type="button"
              class="secondary"
              data-control-id={id('keepHours')}
              disabled={!validDecimal(multiplier(), smallestPositive)}
              onClick={() => update({ multiplier: multiplier(), factorDraft: undefined })}
            >
              {c().keepHours}
            </button>
            <button type="button" class="secondary" data-control-id={id('adjustHours')} disabled>
              {c().adjustHours}
            </button>
            <button
              type="button"
              class="secondary"
              data-control-id={id('cancel')}
              onClick={() => update({ factorDraft: undefined })}
            >
              {c().cancel}
            </button>
          </div>
        </section>
      </Show>
      <div class="review-fields">
        <ReviewSelect
          id={id('price')}
          label={c().price}
          value={p().price}
          options={methods}
          text={(key) => c()[key]}
          change={(price) => update({ price })}
        />
        <ReviewNumber
          id={id('rate')}
          label={c().rate + ' · ' + phaseRateUnit(p(), props.currency)}
          value={phaseRate(p())}
          error={c().numberHelp}
          change={(rate) => update({ rate: { ...p().rate, [phaseRateKey(p())]: rate } })}
        />
        <ReviewNumber
          id={id('material')}
          label={c().material + ' · ' + props.currency}
          value={p().material}
          error={c().numberHelp}
          optional
          change={(material) => update({ material })}
        />
      </div>
      <p class="review-note">{c().unavailable}</p>
    </>
  );
}
