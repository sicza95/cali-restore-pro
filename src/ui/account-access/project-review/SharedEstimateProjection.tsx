import { For, Show } from 'solid-js';
import type { EstimateScope } from '../../../platform/projects/sharing-scopes';
import type { Language } from '../types';
import { estimateCopy } from './estimate-copy';
import type { EstimateSummary } from '../../../platform/estimates/snapshots';
import type { EstimateSnapshot } from '../../../platform/estimates/types';

export function SharedEstimateProjection(props: {
  scope: Exclude<EstimateScope, 'none'>;
  rows: readonly string[];
  language: Language;
}) {
  const c = () => estimateCopy[props.language];
  const projection = () => {
    if (!props.rows[0]?.startsWith('{')) return undefined;
    const value = JSON.parse(props.rows[0]) as
      EstimateSummary | { scope: 'estimate-full'; snapshot: EstimateSnapshot };
    return value.scope === 'estimate-summary'
      ? value
      : {
          ...value.snapshot.result,
          version: value.snapshot.version,
          freshness: 'issued',
          currency: value.snapshot.input.currency,
        };
  };
  const fields = () =>
    props.scope === 'estimate-full'
      ? projection()
        ? (['sharedTotal', 'sharedHours'] as const)
        : (['sharedTotal', 'sharedHours', 'sharedRate'] as const)
      : (['sharedTotal'] as const);
  return (
    <div data-control-id="estimate.scope.projection">
      <p>
        {projection()
          ? `${projection()!.currency} · v${projection()!.version} · ${projection()!.freshness}`
          : c().readOnly}
      </p>
      <For each={projection()?.objects}>
        {(object) => (
          <p>
            {object.name} · {object.subtotal}
          </p>
        )}
      </For>
      <For each={projection() ? (['extras', 'beforeTax', 'taxTotal'] as const) : []}>
        {(key) => (
          <p>
            {c()[key]} · {projection()![key]}
          </p>
        )}
      </For>
      <Show when={projection() && props.scope === 'estimate-full'}>
        <For
          each={
            (JSON.parse(props.rows[0]!) as { snapshot: EstimateSnapshot }).snapshot.result.phases
          }
        >
          {(phase) => (
            <p>
              {phase.id} · {c().hours} {phase.hours ?? '—'} · {c().material} {phase.material} ·{' '}
              {c().subtotal} {phase.subtotal ?? '—'}
            </p>
          )}
        </For>
      </Show>
      <dl class="review-facts">
        <For each={fields()}>
          {(key, index) => (
            <>
              <dt>{c()[key]}</dt>
              <dd>
                {projection()
                  ? index() === 0
                    ? projection()!.total
                    : props.scope === 'estimate-full'
                      ? (JSON.parse(props.rows[0]!) as { snapshot: EstimateSnapshot }).snapshot
                          .result.hours
                      : '—'
                  : props.rows[index()]}
              </dd>
            </>
          )}
        </For>
      </dl>
    </div>
  );
}
