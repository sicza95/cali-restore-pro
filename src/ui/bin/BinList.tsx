import { For, Show } from 'solid-js';
import type { Language } from '../../platform/i18n/language';
import { binCopy } from './bin-copy';
import { commandReason, pathText, type BinRow } from './utils';
import './bin.css';

export type BinListProps = {
  language: Language;
  rows: readonly BinRow[];
  /** Deletion ID of the row whose command is running. */
  busy: string | null;
  onRestore: (row: BinRow) => void;
  onPurge: (row: BinRow) => void;
  onInfo: (row: BinRow) => void;
};

/** One row per retained deletion. Enter or double-click opens Info, never restore or editing. */
export function BinList(props: BinListProps) {
  const copy = () => binCopy[props.language];
  const date = (value: number) =>
    new Intl.DateTimeFormat(props.language, { dateStyle: 'medium', timeStyle: 'short' }).format(
      value,
    );
  return (
    <ul class="bin-list" aria-label={copy().title}>
      <For each={props.rows}>
        {(row) => {
          const pending = () => row.entry.pending;
          // A queued trash can still be restored here (that cancels it); a sent one cannot.
          const restoreReason = () =>
            row.state === 'expired'
              ? copy().failures.expired
              : pending()?.stage === 'dispatched'
                ? copy().failures.pending_sync
                : commandReason(copy(), row.restoreDenied);
          const purgeReason = () =>
            pending() ? copy().failures.pending_sync : commandReason(copy(), row.purgeDenied);
          const syncText = () => {
            const state = pending();
            if (!state) return row.entry.scope === 'hosted' ? copy().hosted : undefined;
            if (state.stage !== 'conflict') return copy().sync[state.stage];
            const reason = state.failure
              ? (copy().syncFailures[state.failure] ?? copy().failures[state.failure])
              : copy().unknownFailure;
            return copy().sync.conflict(reason);
          };
          return (
            <li
              class="bin-row"
              tabindex="0"
              data-bin-entry={row.entry.deletionId}
              aria-label={`${copy().kinds[row.entry.entity.kind]}: ${row.name}`}
              onDblClick={() => props.onInfo(row)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && event.target === event.currentTarget) {
                  event.preventDefault();
                  props.onInfo(row);
                }
              }}
            >
              <div class="bin-row-text">
                <strong class="bin-row-name">{row.name}</strong>
                <span class="bin-row-meta">
                  {copy().kinds[row.entry.entity.kind]} · {pathText(copy(), row.path)}
                </span>
                <span class="bin-row-meta">
                  {copy().deletedOn(date(row.entry.deletedAt))} ·{' '}
                  <Show when={row.state !== 'expired'} fallback={<em>{copy().expired}</em>}>
                    <span title={copy().until(date(row.entry.recoverUntil))}>
                      {copy().remaining(row.days)}
                    </span>
                  </Show>
                </span>
                <Show when={syncText()}>
                  {(text) => (
                    <span
                      class="bin-row-meta"
                      data-bin-sync={pending()?.stage ?? 'hosted'}
                      role={pending()?.stage === 'conflict' ? 'note' : undefined}
                    >
                      {text()}
                    </span>
                  )}
                </Show>
              </div>
              <div class="bin-row-actions">
                <button
                  type="button"
                  class="cr-button"
                  data-control-id="bin.restore"
                  aria-disabled={!!restoreReason() || props.busy !== null}
                  title={restoreReason()}
                  onClick={() => !restoreReason() && props.busy === null && props.onRestore(row)}
                >
                  {props.busy === row.entry.deletionId ? copy().working : copy().restore}
                </button>
                <button
                  type="button"
                  class="cr-button cr-button--danger"
                  data-control-id="bin.purge"
                  aria-disabled={!!purgeReason() || props.busy !== null}
                  title={purgeReason()}
                  onClick={() => !purgeReason() && props.busy === null && props.onPurge(row)}
                >
                  {copy().purge}
                </button>
                <button
                  type="button"
                  class="cr-button"
                  data-control-id="bin.info"
                  onClick={() => props.onInfo(row)}
                >
                  {copy().info}
                </button>
              </div>
            </li>
          );
        }}
      </For>
    </ul>
  );
}
