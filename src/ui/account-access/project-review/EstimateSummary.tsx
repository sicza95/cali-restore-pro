import { For } from 'solid-js';
import type { EstimateCopy } from '../../../platform/estimates/copy';
import type { EstimateResult, EstimateSnapshot } from '../../../platform/estimates/types';
import { formatHours, formatMoney } from '../../../platform/format/number';
import type { Language } from '../types';
import { versionLine } from './estimate-version';

const facts = ['total', 'beforeTax', 'taxTotal', 'subtotal', 'hours'] as const;

/** Always-visible totals, the latest saved version and the save status. */
export function EstimateSummary(props: {
  copy: EstimateCopy;
  language: Language;
  currency: string;
  result: EstimateResult | undefined;
  latest: EstimateSnapshot | undefined;
  status: string;
}) {
  const c = () => props.copy;
  return (
    <section class="project-pane estimate-summary" aria-labelledby="estimate-summary-title">
      <h3 id="estimate-summary-title">{c().summary}</h3>
      <dl class="estimate-totals">
        <For each={facts}>
          {(key) => (
            <div classList={{ 'estimate-total': key === 'total' }}>
              <dt>{c()[key]}</dt>
              <dd data-estimate-result={key}>
                {key === 'hours'
                  ? formatHours(props.result?.hours, props.language)
                  : formatMoney(props.result?.[key], props.currency, props.language)}
              </dd>
            </div>
          )}
        </For>
      </dl>
      <p class="review-note">
        {props.latest ? versionLine(props.language, props.latest) : c().noSnapshot} {c().note}
      </p>
      <p role="status">{props.status}</p>
    </section>
  );
}
