import {
  createMemo,
  createResource,
  createSignal,
  Match,
  onCleanup,
  Show,
  Switch,
  untrack,
} from 'solid-js';
import { BinError } from '../../platform/projects/bin/errors';
import { readHostedCatalog } from '../../platform/projects/bin/hosted-catalog';
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
  mergeHostedRows,
  visibleRows,
  type BinOrder,
  type BinRow,
} from './utils';

/** Local and hosted deletions for one organisation. */
export function BinPage(props: { vault: LocalVault; account: string; organisation: string }) {
  const app = useApp();
  const orgs = useOrganisations();
  const copy = () => binCopy[app.lang()];
  const bin = localBin(
    untrack(() => props.vault),
    untrack(() => props.account),
    Date.now,
    () => app.csrf(),
  );
  const lifetime = new AbortController();
  let request: AbortController | undefined;
  const [entries, { refetch }] = createResource(async () => {
    request?.abort();
    const current = (request = new AbortController());
    const signal = AbortSignal.any([lifetime.signal, current.signal]);
    const token = app.csrf();
    if (token && navigator.onLine) await bin.dispatch(token).catch(() => undefined);
    signal.throwIfAborted();
    const [device, hosted] = await Promise.allSettled([
      bin
        .expire()
        .catch(() => undefined)
        .then(() => bin.list()),
      navigator.onLine
        ? readHostedCatalog(props.organisation, props.vault, signal)
        : Promise.reject(new BinError('offline')),
    ]);
    return { device, hosted };
  });
  const refresh = () => void refetch();
  window.addEventListener('online', refresh);
  window.addEventListener('offline', refresh);
  window.addEventListener('focus', refresh);
  onCleanup(() => {
    lifetime.abort();
    window.removeEventListener('online', refresh);
    window.removeEventListener('offline', refresh);
    window.removeEventListener('focus', refresh);
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
    const now = Date.now();
    const result = entries.latest;
    const device = result?.device.status === 'fulfilled' ? result.device.value : [];
    const local = forOrganisation(
      device,
      props.organisation,
      organisation()?.personal ?? false,
      known,
    );
    const hosted =
      !entries.loading && result?.hosted.status === 'fulfilled' ? result.hosted.value : [];
    return mergeHostedRows(binRows(local, now), hosted, copy(), now);
  });
  const incomplete = () =>
    entries.latest?.device.status === 'rejected' || entries.latest?.hosted.status === 'rejected';
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
    if (!rows().some((current) => current === row && !current.restoreDenied)) return;
    setBusy(row.entry.deletionId);
    setError(undefined);
    try {
      const { deletionId, version, entity } = row.entry;
      if (row.legacyProject) {
        await bin.restoreLegacyProject(entity.projectId, version);
        setAnnouncement(copy().restored(row.name));
      } else {
        const plan = row.remoteRestore
          ? await bin.restoreRemote(props.organisation, entity.projectId, { deletionId, version })
          : await bin.restore(deletionId);
        // A surface whose object was also in the Bin brings that object back with it.
        setAnnouncement(
          plan.group.length > 1 ? copy().restoredWithParent(row.name) : copy().restored(row.name),
        );
      }
      await refetch();
    } catch (failure) {
      setError(failureText(copy(), failure));
    } finally {
      setBusy(null);
    }
  }
  async function purge(row: BinRow) {
    const current = rows().find(
      (current) =>
        current.entry.deletionId === row.entry.deletionId &&
        current.entry.version === row.entry.version &&
        !current.entry.pending &&
        !current.purgeDenied,
    );
    if (!current) {
      setError(copy().failures.stale_revision);
      return;
    }
    setBusy(row.entry.deletionId);
    setError(undefined);
    try {
      const { deletionId, version, entity } = current.entry;
      const target = { deletionId, version };
      if (current.remotePurge) await bin.purgeRemote(entity.projectId, target);
      else {
        const plan = await bin.purge([target]);
        if (plan.denied.length) throw new BinError(plan.denied[0]!.reason);
      }
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
      <Show when={!entries.loading && incomplete()}>
        <div class="browser-diagnostics" role="status">
          <Show when={entries.latest?.device.status === 'rejected'}>
            <p>{copy().failed}</p>
          </Show>
          <Show when={entries.latest?.hosted.status === 'rejected'}>
            <p>{copy().hostedUnavailable}</p>
          </Show>
          <button type="button" class="cr-button" data-control-id="bin.retry" onClick={refresh}>
            {copy().retry}
          </button>
        </div>
      </Show>
      <Switch>
        <Match when={entries.loading && !rows().length}>
          <p role="status">{copy().loading}</p>
        </Match>
        <Match when={!rows().length && !incomplete()}>
          <p class="bin-empty">{copy().empty}</p>
        </Match>
        <Match when={!shown().length && !incomplete() && !entries.loading}>
          <p class="bin-empty">{copy().noMatch}</p>
        </Match>
        <Match when={shown().length > 0}>
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
