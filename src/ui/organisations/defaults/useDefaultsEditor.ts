import { createSignal, onCleanup, untrack } from 'solid-js';
import type {
  OrganisationDefaults,
  OrganisationDefaultsPatch,
  OrganisationDetail,
} from '../../../platform/api';
import { useApp } from '../../app-context/AppContext';
import { organisationDefaults } from './model';
import { useOrganisations } from '../organisation-state';
import { organisationDefaultsCopy } from './copy';

export function useDefaultsEditor(props: {
  detail: OrganisationDetail;
  changed: () => Promise<unknown>;
}) {
  const app = useApp();
  const id = untrack(() => props.detail.id);
  const account = untrack(() => app.account()!.id);
  const orgs = useOrganisations();
  const initial = untrack(() =>
    props.detail.personal && !props.detail.defaults
      ? organisationDefaults(props.detail, account)
      : undefined,
  );
  const [busy, setBusy] = createSignal(false);
  const [pending, setPending] = createSignal<OrganisationDefaults>();
  const current = () => pending() ?? organisationDefaults(props.detail, account);
  let queued: OrganisationDefaultsPatch | undefined;
  let saving = false;
  let active = true;
  onCleanup(() => {
    active = false;
  });
  const merge = (
    base: OrganisationDefaults,
    patch: OrganisationDefaultsPatch,
  ): OrganisationDefaults => ({
    restoration: { ...base.restoration, ...patch.restoration },
    branding: { ...base.branding, ...patch.branding },
  });
  async function flush() {
    if (saving) return;
    saving = true;
    setBusy(true);
    try {
      while (queued && app.account()?.id === account) {
        const patch = queued;
        queued = undefined;
        await app.request(
          `/organisations/${id}/defaults`,
          {
            ...patch,
            ...(initial ? { initial } : {}),
          },
          'PATCH',
        );
        if (active) await props.changed();
        else await orgs.refresh();
      }
      if (active) app.notify('settingSaved');
    } catch {
      queued = undefined;
      if (active) app.notify({ text: organisationDefaultsCopy[app.lang()].saveFailed }, true);
    } finally {
      saving = false;
      setBusy(false);
      if (active) setPending(undefined);
    }
  }
  function save(patch: OrganisationDefaultsPatch) {
    if (!active || props.detail.role !== 'admin' || app.account()?.id !== account) return;
    setPending(merge(current(), patch));
    queued = {
      restoration: { ...queued?.restoration, ...patch.restoration },
      branding: { ...queued?.branding, ...patch.branding },
    };
    void flush();
  }
  return { current, save, busy };
}
