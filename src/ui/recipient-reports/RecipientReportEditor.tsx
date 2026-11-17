import { createSignal, For, Show, untrack } from 'solid-js';
import { useApp } from '../app-context/AppContext';
import {
  authorRecipientReport,
  availableFinances,
  grantFinances,
} from '../../platform/recipient-reports/scope';
import { recipientFormats } from '../../platform/recipient-reports/types';
import type {
  RecipientFinances,
  RecipientFormat,
  RecipientGrant,
  SharedSource,
} from '../../platform/recipient-reports/types';
import { recipientReportCopy } from './copy';
import type { RecipientReports } from './useRecipientReports';

/**
 * The recipient's own report from one active grant (ADR 0008). The choices offered are only what
 * the grant shares and what was opened; `authorRecipientReport` filters again before saving.
 */
export function RecipientReportEditor(props: {
  grant: RecipientGrant;
  source: SharedSource;
  store: RecipientReports;
}) {
  const app = useApp();
  const c = () => recipientReportCopy[app.lang()];
  // Mounted per opened grant, so its saved draft is read once.
  const saved = untrack(() => props.store.find(props.grant.project, props.grant.invitation));
  const source = (): SharedSource => ({
    ...props.source,
    estimate: props.source.estimate ?? saved?.document.estimate,
  });
  const [excluded, setExcluded] = createSignal(saved?.document.settings.excluded ?? []);
  const [notes, setNotes] = createSignal(saved?.document.settings.notes ?? '');
  const [finances, setFinances] = createSignal<RecipientFinances>(
    saved?.document.settings.finances ?? 'none',
  );
  const [language, setLanguage] = createSignal(saved?.document.settings.language ?? app.lang());
  const [format, setFormat] = createSignal<RecipientFormat>(
    saved?.document.settings.format ?? 'PDF',
  );
  const [status, setStatus] = createSignal<'saved' | 'saveError' | 'chooseSurface'>();
  const [busy, setBusy] = createSignal(false);
  const levels = () => availableFinances(props.grant, source());
  const surfaces = () =>
    props.source.project.objects.flatMap((object, o) =>
      object.surfaces.map((surface, s) => ({
        key: `${o}/${s}`,
        label: object.name + ' / ' + surface.name,
      })),
    );

  async function save() {
    setStatus(undefined);
    if (surfaces().every(({ key }) => excluded().includes(key))) return setStatus('chooseSurface');
    setBusy(true);
    try {
      const document = authorRecipientReport(
        props.grant,
        source(),
        {
          language: language(),
          notes: notes(),
          excluded: excluded(),
          finances: finances(),
          format: format(),
        },
        new Date().toISOString(),
      );
      await props.store.save(document);
      setFinances(document.settings.finances);
      setStatus('saved');
    } catch {
      setStatus('saveError');
    } finally {
      setBusy(false);
    }
  }

  return (
    <details class="scope-editor recipient-report-editor" data-control-id="recipient-report.author">
      <summary>{c().author}</summary>
      <p>{c().help}</p>
      <fieldset>
        <legend>{c().surfaces}</legend>
        <For each={surfaces()}>
          {(surface) => (
            <label class="confirmation">
              <input
                type="checkbox"
                checked={!excluded().includes(surface.key)}
                onChange={(event) =>
                  setExcluded((keys) =>
                    event.currentTarget.checked
                      ? keys.filter((key) => key !== surface.key)
                      : [...keys, surface.key],
                  )
                }
              />
              {surface.label}
            </label>
          )}
        </For>
      </fieldset>
      <label>
        {c().notes}
        <textarea
          data-control-id="recipient-report.notes"
          value={notes()}
          maxLength={4000}
          onInput={(event) => setNotes(event.currentTarget.value)}
        />
      </label>
      <label>
        {c().finances}
        <select
          data-control-id="recipient-report.finances"
          value={levels().includes(finances()) ? finances() : 'none'}
          onChange={(event) => setFinances(event.currentTarget.value as RecipientFinances)}
        >
          <For each={levels()}>{(level) => <option value={level}>{c()[level]}</option>}</For>
        </select>
      </label>
      <Show
        when={grantFinances(props.grant).length > 1}
        fallback={<p data-control-id="recipient-report.no-estimate">{c().noEstimate}</p>}
      >
        <Show when={levels().length < grantFinances(props.grant).length}>
          <p>{c().openEstimate}</p>
        </Show>
      </Show>
      <label>
        {c().language}
        <select
          data-control-id="recipient-report.language"
          value={language()}
          onChange={(event) => setLanguage(event.currentTarget.value as 'en' | 'hu')}
        >
          <option value="en">English</option>
          <option value="hu">Magyar</option>
        </select>
      </label>
      <label>
        {c().format}
        <select
          data-control-id="recipient-report.format"
          value={format()}
          onChange={(event) => setFormat(event.currentTarget.value as RecipientFormat)}
        >
          <For each={recipientFormats}>{(item) => <option value={item}>{item}</option>}</For>
        </select>
      </label>
      <button
        class="primary"
        data-control-id="recipient-report.save"
        disabled={busy()}
        onClick={() => void save()}
      >
        {c().save}
      </button>
      <Show when={status()}>
        {(message) => <p role={message() === 'saved' ? 'status' : 'alert'}>{c()[message()]}</p>}
      </Show>
    </details>
  );
}
