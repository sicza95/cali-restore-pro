import { For, Show } from 'solid-js';
import { checkpointFixtures } from '../../editor/checkpoint-review/fixtures';
import { reportCopy } from './report-copy';
import type { ReportCopy } from './report-copy';
import type { Draft, PreviewSurface } from './report-model';
import type { Version } from '../../../platform/reports/types';
import { convertArea } from '../../../platform/estimates/units';
import { ReportEstimatePreview } from './ReportEstimatePreview';

function ReportVersion(props: {
  draft: Draft;
  surface: PreviewSurface;
  version: Version;
  comparison?: boolean;
  copy: ReportCopy;
}) {
  const c = () => props.copy;
  const sample = () =>
    props.version === 'current' ? undefined : checkpointFixtures[props.version];
  const unit = () => props.surface.unit;
  const area = (value: number) =>
    new Intl.NumberFormat(props.draft.language, { maximumFractionDigits: 2 }).format(
      Number(convertArea(String(value), 'm²', unit()).round(2)),
    ) +
    ' ' +
    unit();
  return (
    <section class="report-version">
      <h5>
        {props.comparison ? c().comparison + ' · ' : ''}
        {c()[props.version]}
      </h5>
      <p>{sample() ? c().sample : c().missing}</p>
      <Show when={props.draft.content.map}>
        <Show when={sample()} fallback={<p>{c().mapMissing}</p>}>
          {(fixture) => (
            <svg
              class="checkpoint-map report-map"
              viewBox="0 0 160 96"
              role="img"
              aria-label={c().sampleMap}
            >
              <rect class="checkpoint-wall" x="10" y="9" width={1.4 * fixture().crop} height="78" />
              <rect
                class="checkpoint-mask"
                x={fixture().left}
                y="27"
                width={fixture().width}
                height="40"
              />
            </svg>
          )}
        </Show>
      </Show>
      <Show when={props.draft.content.legend}>
        <p>{sample() ? c().sampleLegend : c().legendMissing}</p>
      </Show>
      <Show when={props.draft.content.table || props.draft.content.detail}>
        <dl class="review-facts">
          <Show when={props.draft.content.table}>
            <dt>{c().area}</dt>
            <dd>{sample() ? area(sample()!.area) : '—'}</dd>
            <dt>{c().unique}</dt>
            <dd>{sample() ? area(sample()!.unique) : '—'}</dd>
            <dt>{c().category}</dt>
            <dd>{sample() ? area(sample()!.category) : '—'}</dd>
          </Show>
          <Show when={props.draft.content.detail}>
            <dt>{c().flaking}</dt>
            <dd>{sample() ? area(sample()!.layer) : '—'}</dd>
          </Show>
        </dl>
      </Show>
    </section>
  );
}

export function ReportPreview(props: { draft: Draft }) {
  const draft = () => props.draft;
  const c = () => reportCopy[draft().language];
  return (
    <article lang={draft().language} class="report-paper" aria-labelledby="report-preview-title">
      <p class="review-note">
        {draft().format}
        {draft().workbook ? ' · ' + c()[draft().workbook!] : ''}
        {draft().resolution ? ' · ' + draft().resolution + ' dpi' : ''}
      </p>
      <h3 id="report-preview-title">{c().title}</h3>
      <p>
        <strong>{draft().project.name}</strong>
      </p>
      <p>
        {c().projectRevision} {draft().project.revision} · {c().projectDate}{' '}
        {new Intl.DateTimeFormat(draft().language, { dateStyle: 'medium' }).format(
          draft().project.updatedAt,
        )}
      </p>
      <p class="review-note">{c().previewNote}</p>
      <Show when={draft().estimateState}>
        {(state) => (
          <p role="status">{state() === 'outsideScope' ? c().outsideScope : c().noEstimate}</p>
        )}
      </Show>
      <Show when={draft().branding}>
        {(brand) => (
          <div class="report-brand" style={{ 'border-inline-start-color': brand().accent }}>
            <Show when={brand().logo}>
              <img class="report-logo" src={brand().logo} alt={c().branding} />
            </Show>
            <Show when={brand().studio}>
              <strong>{brand().studio}</strong>
            </Show>
            <Show when={brand().contact}>
              <p>{brand().contact}</p>
            </Show>
          </div>
        )}
      </Show>
      <For each={draft().surfaces}>
        {(surface) => (
          <section class="report-sheet-row">
            <h4>
              {surface.object} / {surface.name}
            </h4>
            <p>
              {c().units} · {surface.unit}
            </p>
            <div class="review-fields">
              <ReportVersion
                draft={draft()}
                surface={surface}
                version={surface.version}
                copy={c()}
              />
              <Show when={surface.compare || undefined}>
                {(other) => (
                  <ReportVersion
                    draft={draft()}
                    surface={surface}
                    version={other()}
                    comparison
                    copy={c()}
                  />
                )}
              </Show>
            </div>
            <Show when={surface.references.length}>
              <h5>{c().references}</h5>
              <ul>
                <For each={surface.references}>
                  {(photo) => (
                    <li>
                      {c().reference} {photo} · {c().refPending}
                    </li>
                  )}
                </For>
              </ul>
            </Show>
          </section>
        )}
      </For>
      <Show when={draft().notes.trim()}>
        <section>
          <h4>{c().notes}</h4>
          <p class="report-notes">{draft().notes}</p>
        </section>
      </Show>
      <Show when={draft().estimate}>
        {(estimate) => <ReportEstimatePreview estimate={estimate()} language={draft().language} />}
      </Show>
      <Show when={draft().branding?.footer}>
        <footer>{draft().branding!.footer}</footer>
      </Show>
    </article>
  );
}
