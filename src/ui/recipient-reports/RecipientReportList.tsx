import { For, Show } from 'solid-js';
import { useApp } from '../app-context/AppContext';
import { recipientReportCopy } from './copy';
import type { RecipientReports } from './useRecipientReports';
import './styles.css';

/**
 * The recipient's saved report drafts. A draft whose grant is no longer active stays here with a
 * warning (ADR 0008); `active` is undefined until the inbox has loaded, so no warning shows early.
 */
export function RecipientReportList(props: {
  store: RecipientReports;
  active: (invitation: string) => boolean | undefined;
}) {
  const app = useApp();
  const c = () => recipientReportCopy[app.lang()];
  const date = (value: string) =>
    new Intl.DateTimeFormat(app.lang(), { dateStyle: 'medium', timeStyle: 'short' }).format(
      new Date(value),
    );
  return (
    <section class="shared-project recipient-reports" aria-label={c().heading}>
      <h2>{c().heading}</h2>
      <Show when={props.store.reports() === null}>
        <p role="alert">{c().loadError}</p>
      </Show>
      <Show when={props.store.reports()?.length === 0}>
        <p>{c().empty}</p>
      </Show>
      <ul>
        <For each={props.store.reports() ?? []}>
          {(saved) => (
            <li data-recipient-report={saved.document.invitation}>
              <strong>{saved.document.source.name}</strong>
              <span>
                {c().draft} · {c()[saved.document.settings.finances]} ·{' '}
                {saved.document.settings.format}
              </span>
              <span>
                {c().savedAt}{' '}
                <time dateTime={saved.document.savedAt}>{date(saved.document.savedAt)}</time>
              </span>
              <Show when={props.active(saved.document.invitation) === false}>
                <p role="note" class="recipient-report-warning">
                  {c().revoked}
                </p>
              </Show>
              <div class="owner-actions">
                <button
                  data-control-id="recipient-report.download"
                  disabled={props.store.working() !== undefined}
                  onClick={() => void props.store.download(saved.document)}
                >
                  {c().download} {saved.document.settings.format}
                </button>
                <button
                  data-control-id="recipient-report.remove"
                  disabled={props.store.working() !== undefined}
                  onClick={() => {
                    if (confirm(c().removeConfirm)) void props.store.remove(saved);
                  }}
                >
                  {c().remove}
                </button>
              </div>
              <Show when={props.store.working() === saved.document.invitation}>
                <p role="status">{c().exporting}</p>
              </Show>
              <Show when={props.store.failed() === saved.document.invitation}>
                <p role="alert">{c().exportError}</p>
              </Show>
            </li>
          )}
        </For>
      </ul>
    </section>
  );
}
