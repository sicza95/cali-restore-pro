import { For, Show } from 'solid-js';
import { assessmentBlock } from '../../../platform/reports/assessment-rows';
import { mapSvg } from '../../../platform/reports/map-svg';
import { reportCopy } from '../../../platform/reports/copy';
import type { ReportCopy } from '../../../platform/reports/copy';
import type { Draft, PreviewSurface, Version } from '../../../platform/reports/types';
import { ReportEstimatePreview } from './ReportEstimatePreview';

function ReportVersion(props: {
  draft: Draft;
  surface: PreviewSurface;
  version: Version;
  comparison?: boolean;
  copy: ReportCopy;
}) {
  const block = () =>
    assessmentBlock(props.draft, props.surface, props.version, !!props.comparison);
  const number = () =>
    new Intl.NumberFormat(props.draft.language, { maximumSignificantDigits: 15 });
  return (
    <section class="report-version">
      <h5>
        {props.comparison ? props.copy.comparison + ' · ' : ''}
        {block().name}
      </h5>
      <Show when={block().map}>
        {(map) => (
          <img
            class="checkpoint-map report-map"
            alt={props.copy.assessmentMap}
            src={
              'data:image/svg+xml,' +
              encodeURIComponent(mapSvg(map(), 'preview-map', 0, 0, map().width, map().height))
            }
          />
        )}
      </Show>
      <dl class="review-facts">
        <For each={block().rows}>
          {([, label, value, unit]) => (
            <>
              <dt>{label}</dt>
              <dd>
                {typeof value === 'number' ? number().format(value) : (value ?? '—')}
                {value != null && unit ? ' ' + unit : ''}
              </dd>
            </>
          )}
        </For>
      </dl>
      <For each={block().photos}>
        {(photo) => <img class="checkpoint-map report-map" src={photo.url} alt={photo.label} />}
      </For>
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
