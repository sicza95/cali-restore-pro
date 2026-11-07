import { createSignal, For, Show, untrack } from 'solid-js';
import { createStore } from 'solid-js/store';
import type { SavedProject } from '../../../platform/projects/types';
import { loadPreferences } from '../settings/preferences/utils';
import type { Language } from '../types';
import { estimateUnits } from './estimate-model';
import { ReviewCheck, ReviewSelect } from './fields';
import { reportControl as id } from './report-controls';
import { reportCopy } from './report-copy';
import { contentKeys, defaultSelection, formats } from './report-model';
import type { Draft, Format, Selection } from './report-model';
import { ReportPreview } from './ReportPreview';
import { ReportScope } from './ReportScope';
import { BrandingSettings, createBranding } from './ReportSettings';

const units = ['inherited', ...estimateUnits] as const;

export function ReportReview(props: {
  project: SavedProject;
  language: Language;
  account: string;
  output: boolean;
}) {
  const c = () => reportCopy[props.language];
  const defaults = untrack(() => loadPreferences(props.account));
  const [language, setLanguage] = createSignal<Language>(
    defaults.reportLanguage === 'hu' ? 'hu' : 'en',
  );
  const [unit, setUnit] = createSignal<(typeof units)[number]>('inherited');
  const [excluded, setExcluded] = createSignal<string[]>([]);
  const [surfaces, setSurfaces] = createStore<Record<string, Selection>>({});
  const [content, setContent] = createStore({
    map: true,
    legend: true,
    table: true,
    detail: false,
  });
  const [notes, setNotes] = createSignal('');
  const [finances, setFinances] = createSignal<Draft['finances']>('none');
  const [format, setFormat] = createSignal<Format>('PDF');
  const [dpi, setDpi] = createSignal('300');
  const [workbook, setWorkbook] = createSignal<Draft['workbook']>('snapshot');
  const [draft, setDraft] = createSignal<Draft>();
  const branding = createBranding(defaults);
  let dialog!: HTMLDialogElement;

  const selected = (): Draft['surfaces'] =>
    props.project.objects
      .filter((object) => !excluded().includes(object.id))
      .flatMap((object) =>
        object.surfaces.flatMap((surface) => {
          const scope = surfaces[surface.id] ?? defaultSelection;
          if (!scope.included) return [];
          const inherited = surface.units ?? object.units ?? props.project.settings.units;
          const chosen = unit();
          return [
            {
              id: surface.id,
              name: surface.name,
              object: object.name,
              version: scope.version,
              compare: scope.compare,
              unit: chosen === 'inherited' ? (inherited === 'imperial' ? 'ft²' : 'm²') : chosen,
              references: surface.images
                .filter(({ role }) => role === 'reference')
                .flatMap(({ id }, index) => (scope.references.includes(id) ? [index + 1] : [])),
            },
          ];
        }),
      );

  function preview() {
    const entries = selected();
    if (!entries.length) return;
    const { name, revision, updatedAt } = props.project;
    setDraft({
      project: { name, revision, updatedAt },
      surfaces: entries,
      language: language(),
      content: { ...content },
      notes: notes(),
      finances: finances(),
      branding: branding.branding(),
      format: format(),
      resolution: dpi(),
      workbook: workbook(),
    });
    dialog.showModal();
  }

  const actions = () => (
    <section class="project-pane">
      <h3>{c().output}</h3>
      <div class="review-fields">
        <ReviewSelect
          id={id('format')}
          label={c().format}
          value={format()}
          options={formats}
          change={setFormat}
        />
        <Show when={format() === 'PNG' || format() === 'PDF'}>
          <ReviewSelect
            id={id('resolution')}
            label={c().resolution}
            value={dpi()}
            options={['150', '300', '600']}
            change={setDpi}
          />
        </Show>
        <Show when={format() === 'XLSX'}>
          <ReviewSelect
            id={id('workbook')}
            label={c().workbook}
            value={workbook()}
            options={['snapshot', 'editable']}
            text={(key) => c()[key]}
            change={setWorkbook}
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
          disabled={!selected().length}
          onClick={preview}
        >
          {c().preview}
        </button>
        <button type="button" class="secondary" data-control-id={id('download')} disabled>
          {c().download}
        </button>
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
      <Show when={props.output}>{actions()}</Show>
      <div class="review-grid">
        <ReportScope
          project={props.project}
          copy={c()}
          excluded={excluded()}
          surfaces={surfaces}
          toggle={(id) =>
            setExcluded((rows) =>
              rows.includes(id) ? rows.filter((row) => row !== id) : [...rows, id],
            )
          }
          change={(id, patch) =>
            setSurfaces(id, { ...(surfaces[id] ?? defaultSelection), ...patch })
          }
        />
        <div class="review-flow">
          <section class="project-pane">
            <h3>{c().settings}</h3>
            <div class="review-fields">
              <ReviewSelect
                id={id('language')}
                label={c().language}
                value={language()}
                options={['en', 'hu']}
                text={(key) => (key === 'en' ? 'English' : 'Magyar')}
                change={setLanguage}
              />
              <ReviewSelect
                id={id('units')}
                label={c().units}
                value={unit()}
                options={units}
                text={(key) => (key === 'inherited' ? c().inherited : key)}
                change={setUnit}
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
                    checked={content[key]}
                    change={(value) => setContent(key, value)}
                  >
                    {c()[key]}
                  </ReviewCheck>
                )}
              </For>
            </div>
            <ReviewSelect
              id={id('finances')}
              label={c().finances}
              value={finances()}
              options={['none', 'summary', 'full']}
              text={(key) => c()[key]}
              change={setFinances}
            />
            <label>
              {c().notes}
              <textarea
                data-control-id={id('notes')}
                value={notes()}
                maxlength="2000"
                onInput={(e) => setNotes(e.currentTarget.value)}
              />
            </label>
          </section>
          <BrandingSettings copy={c()} model={branding} />
        </div>
      </div>
      <Show when={!props.output}>{actions()}</Show>
      <dialog
        class="drawing-dialog report-dialog"
        ref={(element) => (dialog = element)}
        aria-labelledby="report-preview-title"
        onClose={() => setDraft(undefined)}
      >
        <div
          class="report-scroll"
          tabindex="0"
          role="region"
          aria-labelledby="report-preview-title"
        >
          <Show when={draft()}>{(value) => <ReportPreview draft={value()} />}</Show>
        </div>
        <button
          type="button"
          class="secondary"
          autofocus
          data-control-id={id('cancel')}
          onClick={() => dialog.close()}
        >
          {c().cancel}
        </button>
      </dialog>
    </div>
  );
}
