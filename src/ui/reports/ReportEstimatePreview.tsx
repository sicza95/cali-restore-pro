import { For, Show } from 'solid-js';
import type { ReportEstimate } from '../../platform/reports/estimate';
import { formatHours, formatMoney, formatRate } from '../../platform/format/number';
import type { Language } from '../account-access/types';
import { estimateCopy } from '../../platform/estimates/copy';
import { reportCopy } from '../../platform/reports/copy';

export function ReportEstimatePreview(props: { estimate: ReportEstimate; language: Language }) {
  const c = () => reportCopy[props.language];
  const e = () => estimateCopy[props.language];
  const summary = () => props.estimate.summary;
  const money = (value: string | null | undefined) =>
    formatMoney(value, summary().currency, props.language);
  return (
    <section class="report-sheet-row">
      <h3>
        {c().finances} · {props.estimate.detail ? c().full : c().summary}
      </h3>
      <p>
        v{summary().version} · {summary().currency} · {summary().calculation} ·{' '}
        {c().projectRevision} {summary().projectRevision} ·{' '}
        <time dateTime={summary().createdAt}>{summary().createdAt.slice(0, 10)}</time>
      </p>
      <p>{props.estimate.draft ? c().estimateDraft : c().estimateIssued}</p>
      <p>{c().unavailableNote}</p>
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
              <dd>{money(object.subtotal)}</dd>
            </>
          )}
        </For>
        <dt>{e().extras}</dt>
        <dd>{money(summary().extras)}</dd>
        <For each={summary().adjustments}>
          {(row, index) => (
            <>
              <dt>
                {e().adjustments} {index() + 1}
              </dt>
              <dd>{money(row.amount)}</dd>
            </>
          )}
        </For>
        <dt>{e().beforeTax}</dt>
        <dd>{money(summary().beforeTax)}</dd>
        <dt>{e().taxTotal}</dt>
        <dd>{money(summary().taxTotal)}</dd>
        <dt>{c().estimateTotal}</dt>
        <dd>
          <strong>{money(summary().total)}</strong>
        </dd>
      </dl>
      <Show when={props.estimate.detail}>
        {(detail) => (
          <>
            <p>
              {e().hours} · {formatHours(detail().hours, props.language)}
            </p>
            <For each={detail().phases}>
              {(phase) => (
                <section>
                  <h4>{phase.name}</h4>
                  <dl class="review-facts">
                    <dt>{e().hours}</dt>
                    <dd>{formatHours(phase.hours, props.language)}</dd>
                    <dt>{e().rate}</dt>
                    <dd>
                      {formatRate(
                        phase.rate,
                        summary().currency,
                        phase.method === 'area'
                          ? phase.unit
                          : phase.method === 'hourly'
                            ? 'h'
                            : undefined,
                        props.language,
                      )}
                    </dd>
                    <dt>{c().workPrice}</dt>
                    <dd>{money(phase.work)}</dd>
                    <dt>{e().material}</dt>
                    <dd>{money(phase.material)}</dd>
                    <dt>{e().subtotal}</dt>
                    <dd>{money(phase.subtotal)}</dd>
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
