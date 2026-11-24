import { createEffect, createSignal, on } from 'solid-js';
import type { OrganisationOverview, OrganisationSummary } from '../../platform/api';
import { useApp } from '../app-context/AppContext';

const cacheKey = (account: string) => `calirestore.organisations.${account}`;
const selectedKey = (account: string) => `calirestore.organisation.${account}`;

type State = { account: string; overview?: OrganisationOverview; failed: boolean };

/**
 * The signed-in account's organisations, shared by the top bar, the project list and the
 * Organisations pages. The last list is kept in this browser, so the project list still sorts
 * projects by organisation offline.
 */
const [state, setState] = createSignal<State>();
const [selectedId, setSelectedId] = createSignal<string>();
let loading: { account: string; done: Promise<void> } | undefined;

function cached(account: string): OrganisationOverview | undefined {
  try {
    const text = localStorage.getItem(cacheKey(account));
    return text ? (JSON.parse(text) as OrganisationOverview) : undefined;
  } catch {
    return undefined;
  }
}

function start(account: string) {
  if (state()?.account === account) return;
  setState({ account, overview: cached(account), failed: false });
  setSelectedId(localStorage.getItem(selectedKey(account)) ?? undefined);
}

async function load(account: string, request: <T>(path: string) => Promise<T>) {
  start(account);
  try {
    const overview = await request<OrganisationOverview>('/organisations');
    if (state()?.account !== account) return;
    localStorage.setItem(cacheKey(account), JSON.stringify(overview));
    setState({ account, overview, failed: false });
  } catch {
    if (state()?.account === account) setState({ ...state()!, failed: true });
  }
}

/** The organisation a project belongs to, defaulting (and falling back) to the personal one. */
export function projectOrganisation(
  organisation: string | undefined,
  list: readonly OrganisationSummary[],
) {
  const personal = list.find((entry) => entry.personal)?.id;
  return organisation && list.some((entry) => entry.id === organisation) ? organisation : personal;
}

export function useOrganisations() {
  const app = useApp();
  const account = () => app.account()?.id;
  const refresh = () => {
    const id = account();
    if (!id) return Promise.resolve();
    if (loading?.account !== id) loading = { account: id, done: load(id, app.request) };
    const current = loading;
    return current.done.finally(() => {
      if (loading === current) loading = undefined;
    });
  };
  createEffect(
    on(account, (id) => {
      if (id && state()?.account !== id) {
        start(id);
        void refresh();
      }
    }),
  );
  const mine = () => (state()?.account === account() ? state() : undefined);
  const list = () => mine()?.overview?.organisations ?? [];
  const selected = () => {
    const all = list();
    return all.find((entry) => entry.id === selectedId()) ?? all.find((entry) => entry.personal);
  };
  return {
    loaded: () => !!mine()?.overview,
    failed: () => !!mine()?.failed && !mine()?.overview,
    list,
    invitations: () => mine()?.overview?.invitations ?? [],
    selected,
    select(id: string) {
      const who = account();
      if (!who) return;
      localStorage.setItem(selectedKey(who), id);
      setSelectedId(id);
    },
    refresh,
  };
}
