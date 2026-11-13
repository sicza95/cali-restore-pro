import { createSignal, createUniqueId, For, Show } from 'solid-js';
import type { EstimateScope } from '../../../platform/projects/sharing-scopes';
import type { Language } from '../types';
import { estimateCopy } from '../../../platform/estimates/copy';
import type { EstimateSummary } from '../../../platform/estimates/snapshots';
import type { EstimateSnapshot } from '../../../platform/estimates/types';
import { reportEstimate } from '../../../platform/reports/estimate';
import type { FullEstimateScope, ReportEstimate } from '../../../platform/reports/estimate';
import { ReportEstimatePreview } from './ReportEstimatePreview';
import { reportCopy } from '../../../platform/reports/copy';
import './styles.css';

export function SharedEstimateProjection(props: {
  scope: Exclude<EstimateScope, 'none'>;
  rows: readonly string[];
  language: Language;
}) {
  const c = () => estimateCopy[props.language];
  const r = () => reportCopy[props.language];
  const title = createUniqueId();
  const [preview, setPreview] = createSignal<ReportEstimate>();
  let dialog!: HTMLDialogElement;
  const authorized = () => {
    if (!props.rows[0]?.startsWith('{')) return undefined;
    const value = JSON.parse(props.rows[0]) as EstimateSummary | FullEstimateScope;
    return value.scope === props.scope ? value : undefined;
  };
  const projection = () => {
    const value = authorized();
    if (!value) return;
    return value.scope === 'estimate-summary'
      ? value
      : {
          ...value.snapshot.result,
          version: value.snapshot.version,
          freshness: value.freshness ?? 'unknown',
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
    <div data-control-id="estimate.scope.projection" class="project-review">
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
        <For each={(authorized() as { snapshot: EstimateSnapshot }).snapshot.result.phases}>
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
                      ? (authorized() as { snapshot: EstimateSnapshot }).snapshot.result.hours
                      : '—'
                  : props.rows[index()]}
              </dd>
            </>
          )}
        </For>
      </dl>
      <Show when={authorized()}>
        {(source) => (
          <button
            type="button"
            class="secondary"
            onClick={() => {
              const value = source();
              const revision =
                value.scope === 'estimate-summary'
                  ? value.projectRevision
                  : value.snapshot.input.revision;
              setPreview(
                reportEstimate(
                  value,
                  value.scope === 'estimate-summary' ? 'summary' : 'full',
                  revision,
                ),
              );
              dialog.showModal();
            }}
          >
            {r().preview}
          </button>
        )}
      </Show>
      <dialog
        class="drawing-dialog report-dialog"
        ref={(element) => (dialog = element)}
        aria-labelledby={title}
        onClose={() => setPreview(undefined)}
      >
        <div class="report-scroll report-paper" tabindex="0" role="region" aria-labelledby={title}>
          <h3 id={title}>
            {r().finances} · {r().draft}
          </h3>
          <Show when={preview()}>
            {(value) => <ReportEstimatePreview estimate={value()} language={props.language} />}
          </Show>
        </div>
        <button type="button" class="secondary" autofocus onClick={() => dialog.close()}>
          {r().cancel}
        </button>
      </dialog>
    </div>
  );
}
