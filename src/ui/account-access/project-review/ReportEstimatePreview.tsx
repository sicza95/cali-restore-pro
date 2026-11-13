import { For, Show } from 'solid-js';
import type { ReportEstimate } from '../../../platform/reports/estimate';
import { quantityText } from '../../../platform/estimates/display';
import type { Language } from '../types';
import { estimateCopy } from '../../../platform/estimates/copy';
import { reportCopy } from '../../../platform/reports/copy';

export function ReportEstimatePreview(props: { estimate: ReportEstimate; language: Language }) {
  const c = () => reportCopy[props.language];
  const e = () => estimateCopy[props.language];
  const summary = () => props.estimate.summary;
  return (
    <section class="report-sheet-row">
      <h4>
        {c().finances} · {props.estimate.detail ? c().full : c().summary}
      </h4>
      <p>
        v{summary().version} · {summary().currency} · {summary().calculation} ·{' '}
        {c().projectRevision} {summary().projectRevision} ·{' '}
        <time dateTime={summary().createdAt}>{summary().createdAt.slice(0, 10)}</time>
      </p>
      <Show when={props.estimate.unknownFreshness}>
        <p>{c().unknownFreshness}</p>
      </Show>
      <Show when={summary().freshness === 'stale'}>
        <p>{c().staleEstimate}</p>
      </Show>
      <Show when={summary().illustrative}>
        <p>{c().sample}</p>
      </Show>
      <dl class="review-facts">
        <For each={summary().objects}>
          {(object) => (
            <>
              <dt>{object.name}</dt>
              <dd>{object.subtotal}</dd>
            </>
          )}
        </For>
        <dt>{e().extras}</dt>
        <dd>{summary().extras}</dd>
        <For each={summary().adjustments}>
          {(row, index) => (
            <>
              <dt>
                {e().adjustments} {index() + 1}
              </dt>
              <dd>{row.amount}</dd>
            </>
          )}
        </For>
        <dt>{e().beforeTax}</dt>
        <dd>{summary().beforeTax}</dd>
        <dt>{e().taxTotal}</dt>
        <dd>{summary().taxTotal}</dd>
        <dt>{c().estimateTotal}</dt>
        <dd>
          <strong>{summary().total}</strong>
        </dd>
      </dl>
      <Show when={props.estimate.detail}>
        {(detail) => (
          <>
            <p>
              {e().hours} · {quantityText(detail().hours)}
            </p>
            <For each={detail().phases}>
              {(phase) => (
                <section>
                  <h5>{phase.name}</h5>
                  <dl class="review-facts">
                    <dt>{e().hours}</dt>
                    <dd>{quantityText(phase.hours)}</dd>
                    <dt>{e().rate}</dt>
                    <dd>
                      {phase.rate} {summary().currency}
                      {phase.method === 'area'
                        ? '/' + phase.unit
                        : phase.method === 'hourly'
                          ? '/h'
                          : ''}
                    </dd>
                    <dt>{c().workPrice}</dt>
                    <dd>{phase.work}</dd>
                    <dt>{e().material}</dt>
                    <dd>{phase.material}</dd>
                    <dt>{e().subtotal}</dt>
                    <dd>{phase.subtotal}</dd>
                  </dl>
                </section>
              )}
            </For>
          </>
        )}
      </Show>
    </section>
  );
}
