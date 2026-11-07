import { For } from 'solid-js';
import type { EstimateScope } from '../../../platform/projects/sharing-scopes';
import type { Language } from '../types';
import { estimateCopy } from './estimate-copy';

export function SharedEstimateProjection(props: {
  scope: Exclude<EstimateScope, 'none'>;
  rows: readonly string[];
  language: Language;
}) {
  const c = () => estimateCopy[props.language];
  const fields = () =>
    props.scope === 'estimate-full'
      ? (['sharedTotal', 'sharedHours', 'sharedRate'] as const)
      : (['sharedTotal'] as const);
  return (
    <div data-control-id="estimate.scope.projection">
      <p>{c().readOnly}</p>
      <dl class="review-facts">
        <For each={fields()}>
          {(key, index) => (
            <>
              <dt>{c()[key]}</dt>
              <dd>{props.rows[index()]}</dd>
            </>
          )}
        </For>
      </dl>
    </div>
  );
}
