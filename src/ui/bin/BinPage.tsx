import { createMemo, createResource, createSignal, Match, Show, Switch, untrack } from 'solid-js';
import { BinError } from '../../platform/projects/bin/errors';
import { localBin } from '../../platform/projects/bin/local-bin';
import type { LocalVault } from '../../platform/vault/vault';
import { useApp } from '../app-context/AppContext';
import { Field } from '../controls/field/Field';
import { organisationCopy } from '../organisations/organisation-copy';
import { useOrganisations } from '../organisations/organisation-state';
import { organisationLabel } from '../organisations/OrganisationSwitcher';
import { binCopy } from './bin-copy';
import { BinInfoDialog, BinPurgeDialog } from './BinDialogs';
import { BinList } from './BinList';
import {
  binRows,
  failureText,
  forOrganisation,
  visibleRows,
  type BinOrder,
  type BinRow,
} from './utils';

/** `/organisations/<id>/bin`: this device's recoverable deletions for one organisation. */
export function BinPage(props: { vault: LocalVault; account: string; organisation: string }) {
  const app = useApp();
  const orgs = useOrganisations();
  const copy = () => binCopy[app.lang()];
  const bin = localBin(
    untrack(() => props.vault),
    untrack(() => props.account),
  );
  // Deadlines are enforced on read: expired entries are removed before listing.
  const [entries, { refetch }] = createResource(async () => {
    await bin.expire().catch(() => undefined);
    return bin.list();
  });
  const [find, setFind] = createSignal('');
  const [order, setOrder] = createSignal<BinOrder>('newest');
  const [busy, setBusy] = createSignal<string | null>(null);
  const [info, setInfo] = createSignal<BinRow>();
  const [purging, setPurging] = createSignal<BinRow>();
  const [error, setError] = createSignal<string>();
  const [announcement, setAnnouncement] = createSignal('');
  const organisation = () => orgs.list().find(({ id }) => id === props.organisation);
  // The breadcrumb names the organisation, as its own page does.
  app.provideNames(() => {
    const shown = organisation();
    return shown
      ? { [shown.id]: organisationLabel(shown, organisationCopy[app.lang()].personal) }
      : {};
  });
  const rows = createMemo(() => {
    const known = new Set(orgs.list().map(({ id }) => id));
    const all = binRows(entries() ?? [], Date.now());
    return forOrganisation(all, props.organisation, organisation()?.personal ?? false, known);
  });
  const shown = () => visibleRows(rows(), find(), order(), app.lang());
  const cascade = (row: BinRow) =>
    row.entry.entity.kind === 'project'
      ? rows().filter(
          (other) =>
            other.entry.entity.projectId === row.entry.entity.projectId &&
            other.entry.deletionId !== row.entry.deletionId,
        ).length
      : 0;

  async function restore(row: BinRow) {
    setBusy(row.entry.deletionId);
    setError(undefined);
    try {
      await bin.restore(row.entry.deletionId);
      setAnnouncement(copy().restored(row.name));
      await refetch();
    } catch (failure) {
      setError(failureText(copy(), failure));
    } finally {
      setBusy(null);
    }
  }
  async function purge(row: BinRow) {
    setBusy(row.entry.deletionId);
    setError(undefined);
    try {
      const plan = await bin.purge([
        { deletionId: row.entry.deletionId, version: row.entry.version },
      ]);
      if (plan.denied.length) throw new BinError(plan.denied[0]!.reason);
      setPurging(undefined);
      setAnnouncement(copy().purged(row.name));
      await refetch();
    } catch (failure) {
      setError(failureText(copy(), failure));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div class="bin-page">
      <header class="bin-header">
        <p>{copy().intro}</p>
        <p class="bin-scope">{copy().scope}</p>
      </header>
      <div class="bin-toolbar" role="search">
        <Field label={copy().find} value={find()} onInput={setFind} />
        <div class="cr-field">
          <label for="bin-order">{copy().sort}</label>
          <div class="cr-field-input">
            <select
              id="bin-order"
              value={order()}
              data-control-id="bin.order"
              onChange={(event) => setOrder(event.currentTarget.value as BinOrder)}
            >
              <option value="newest">{copy().newest}</option>
              <option value="oldest">{copy().oldest}</option>
              <option value="deadline">{copy().deadline}</option>
              <option value="name">{copy().name}</option>
            </select>
          </div>
        </div>
      </div>
      <Show when={error() && !purging()}>
        <p role="alert" class="browser-diagnostics">
          {error()}
        </p>
      </Show>
      <Switch>
        <Match when={entries.loading && !entries.latest}>
          <p role="status">{copy().loading}</p>
        </Match>
        <Match when={entries.error}>
          <p role="alert">{copy().failed}</p>
          <button
            type="button"
            class="cr-button"
            data-control-id="bin.retry"
            onClick={() => void refetch()}
          >
            {copy().retry}
          </button>
        </Match>
        <Match when={!rows().length}>
          <p class="bin-empty">{copy().empty}</p>
        </Match>
        <Match when={!shown().length}>
          <p class="bin-empty">{copy().noMatch}</p>
        </Match>
        <Match when={true}>
          <BinList
            language={app.lang()}
            rows={shown()}
            busy={busy()}
            onRestore={(row) => void restore(row)}
            onPurge={(row) => {
              setError(undefined);
              setPurging(row);
            }}
            onInfo={setInfo}
          />
        </Match>
      </Switch>
      <p class="visually-hidden" role="status" aria-live="polite">
        {announcement()}
      </p>
      <Show when={info()} keyed>
        {(row) => (
          <BinInfoDialog language={app.lang()} row={row} onClose={() => setInfo(undefined)} />
        )}
      </Show>
      <Show when={purging()} keyed>
        {(row) => (
          <BinPurgeDialog
            language={app.lang()}
            row={row}
            cascade={cascade(row)}
            busy={busy() === row.entry.deletionId}
            error={error()}
            onConfirm={() => void purge(row)}
            onClose={() => setPurging(undefined)}
          />
        )}
      </Show>
    </div>
  );
}
