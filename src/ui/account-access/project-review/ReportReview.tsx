import { createSignal, For, Show } from 'solid-js';
import type { LocalVault } from '../../../platform/vault/vault';
import type { SavedProject } from '../../../platform/projects/types';
import type { Language } from '../types';
import { estimateUnits } from './estimate-model';
import { ReviewCheck, ReviewSelect } from './fields';
import { reportControl as id } from './report-controls';
import { reportCopy } from '../../../platform/reports/copy';
import {
  contentKeys,
  defaultSelection,
  formats,
  resolutions,
} from '../../../platform/reports/types';
import { selectedSurfaces } from './report-model';
import type { Draft } from '../../../platform/reports/types';
import { useReport } from './useReport';
import { useReportDownload } from './useReportDownload';
import { ReportPreview } from './ReportPreview';
import { ReportScope } from './ReportScope';
import { BrandingSettings } from './ReportSettings';

const units = ['inherited', ...estimateUnits] as const;

export function ReportReview(props: {
  vault: LocalVault;
  project: SavedProject;
  language: Language;
  account: string;
  output: boolean;
}) {
  const c = () => reportCopy[props.language];
  const model = useReport(props);
  const { settings, set, ready, busy, status, issued, savedRevision } = model;
  const [draft, setDraft] = createSignal<Draft>();
  const current = () => draft()?.project.revision === props.project.revision;
  const download = useReportDownload(() => props.vault, current);
  let dialog!: HTMLDialogElement;
  const selected = () => selectedSurfaces(props.project, settings);
  const canEditWorkbook = () =>
    settings.finances === 'full' && issued().some(({ id }) => id === settings.estimate);

  function preview() {
    void model.preview((value) => {
      setDraft(value);
      dialog.showModal();
    });
  }

  const actions = () => (
    <section class="project-pane">
      <h3>{c().output}</h3>
      <div class="review-fields">
        <ReviewSelect
          id={id('format')}
          label={c().format}
          value={settings.format}
          options={formats}
          change={(value) => set('format', value)}
        />
        <Show when={settings.format === 'PNG' || settings.format === 'PDF'}>
          <ReviewSelect
            id={id('resolution')}
            label={c().resolution}
            value={settings.resolution}
            options={resolutions}
            change={(value) => set('resolution', value)}
          />
        </Show>
        <Show when={settings.format === 'XLSX'}>
          <ReviewSelect
            id={id('workbook')}
            label={c().workbook}
            value={canEditWorkbook() ? settings.workbook : 'snapshot'}
            options={canEditWorkbook() ? ['snapshot', 'editable'] : ['snapshot']}
            text={(key) => c()[key]}
            change={(value) => set('workbook', value)}
          />
        </Show>
      </div>
      <Show when={!selected().length}>
        <p>{c().noSelection}</p>
      </Show>
      <div class="review-actions">
        <button
          type="button"
          data-control-id={id('preview')}
          disabled={!ready() || busy() || !selected().length}
          onClick={preview}
        >
          {c().preview}
        </button>
        <Show when={model.preparing()}>
          <button type="button" class="secondary" onClick={model.cancel}>
            {c().cancel}
          </button>
        </Show>
        <button type="button" class="secondary" data-control-id={id('final')} disabled>
          {c().final}
        </button>
      </div>
      <p class="review-note">{c().encoder}</p>
    </section>
  );

  return (
    <div class="review-flow report-review">
      <p class="review-note">{c().transient}</p>
      <section class="project-pane" aria-label={c().draft}>
        <div class="review-actions">
          <button
            type="button"
            data-control-id={id('save')}
            disabled={!ready() || busy()}
            onClick={() => void model.save()}
          >
            {c().save}
          </button>
          <Show
            when={
              status() === 'loadError' || status() === 'estimateError' || status() === 'saveError'
            }
          >
            <button
              type="button"
              class="secondary"
              disabled={busy()}
              onClick={() => void model.open()}
            >
              {c().reload}
            </button>
          </Show>
        </div>
        <Show when={busy()}>
          <p role="status">{c().working}</p>
        </Show>
        <Show when={status()}>
          {(state) => <p role={state() === 'saved' ? 'status' : 'alert'}>{c()[state()]}</p>}
        </Show>
        <Show when={savedRevision() !== undefined && savedRevision() !== props.project.revision}>
          <p role="status">{c().olderDraft}</p>
        </Show>
      </section>
      <Show when={ready()}>
        <Show when={props.output}>{actions()}</Show>
        <div class="review-grid">
          <ReportScope
            project={props.project}
            copy={c()}
            excluded={settings.excluded}
            surfaces={settings.surfaces}
            toggle={(id) =>
              set('excluded', (rows) =>
                rows.includes(id) ? rows.filter((row) => row !== id) : [...rows, id],
              )
            }
            change={(id, patch) =>
              set('surfaces', id, { ...(settings.surfaces[id] ?? defaultSelection), ...patch })
            }
          />
          <div class="review-flow">
            <section class="project-pane">
              <h3>{c().settings}</h3>
              <div class="review-fields">
                <ReviewSelect
                  id={id('language')}
                  label={c().language}
                  value={settings.language}
                  options={['en', 'hu']}
                  text={(key) => (key === 'en' ? 'English' : 'Magyar')}
                  change={(value) => set('language', value)}
                />
                <ReviewSelect
                  id={id('units')}
                  label={c().units}
                  value={settings.unit}
                  options={units}
                  text={(key) => (key === 'inherited' ? c().inherited : key)}
                  change={(value) => set('unit', value)}
                />
              </div>
            </section>
            <section class="project-pane">
              <h3>{c().content}</h3>
              <div class="review-fields">
                <For each={contentKeys}>
                  {(key) => (
                    <ReviewCheck
                      id={id(key)}
                      checked={settings.content[key]}
                      change={(value) => set('content', key, value)}
                    >
                      {c()[key]}
                    </ReviewCheck>
                  )}
                </For>
              </div>
              <ReviewSelect
                id={id('finances')}
                label={c().finances}
                value={settings.finances}
                options={['none', 'summary', 'full']}
                text={(key) => c()[key]}
                change={(value) => set('finances', value)}
              />
              <Show when={settings.finances !== 'none'}>
                <ReviewSelect
                  id={id('estimateVersion')}
                  label={c().estimateVersion}
                  value={settings.estimate}
                  options={[...new Set(['', ...issued().map(({ id }) => id), settings.estimate])]}
                  text={(key) => {
                    if (!key) return c().noEstimate;
                    const row = issued().find(({ id }) => id === key);
                    return row ? 'v' + row.version : c().noEstimate;
                  }}
                  change={(value) => set('estimate', value)}
                />
              </Show>
              <label>
                {c().notes}
                <textarea
                  data-control-id={id('notes')}
                  value={settings.notes}
                  maxlength="2000"
                  onInput={(e) => set('notes', e.currentTarget.value)}
                />
              </label>
            </section>
            <BrandingSettings copy={c()} model={model} />
          </div>
        </div>
        <Show when={!props.output}>{actions()}</Show>
      </Show>
      <dialog
        class="drawing-dialog report-dialog"
        ref={(element) => (dialog = element)}
        aria-labelledby="report-preview-title"
        onCancel={download.cancel}
        onClose={() => {
          download.cancel();
          setDraft(undefined);
        }}
      >
        <div
          class="report-scroll"
          tabindex="0"
          role="region"
          aria-labelledby="report-preview-title"
        >
          <Show when={draft()}>{(value) => <ReportPreview draft={value()} />}</Show>
        </div>
        <div class="report-download-actions">
          <div class="review-actions">
            <button
              type="button"
              data-control-id={id('download')}
              disabled={!current() || download.working()}
              onClick={() => void download.download(draft()!)}
            >
              {c().download}
            </button>
            <Show when={download.working()}>
              <button
                type="button"
                class="secondary"
                data-control-id={id('cancelDownload')}
                onClick={download.cancel}
              >
                {c().cancelDownload}
              </button>
            </Show>
            <button
              type="button"
              class="secondary"
              autofocus
              data-control-id={id('cancel')}
              onClick={() => {
                download.cancel();
                dialog.close();
              }}
            >
              {c().cancel}
            </button>
          </div>
          <Show when={download.working()}>
            <p role="status">{c().exporting}</p>
          </Show>
          <Show when={download.failed()}>
            <p role="alert">{c().exportError}</p>
          </Show>
        </div>
      </dialog>
    </div>
  );
}
