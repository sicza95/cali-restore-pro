import { createSignal } from 'solid-js';
import { useApp } from '../app-context/AppContext';
import { organisationCopy, type OrganisationErrorCode } from './organisation-copy';

/** Runs one organisation request at a time and reports the outcome as a toast. */
export function useOrgAction() {
  const app = useApp();
  const [busy, setBusy] = createSignal(false);
  const c = () => organisationCopy[app.lang()];
  async function act(task: () => Promise<unknown>, success: string) {
    if (busy()) return false;
    setBusy(true);
    try {
      await task();
      app.notify({ text: success });
      return true;
    } catch (error) {
      const code = (error instanceof Error ? error.message : '') as OrganisationErrorCode;
      app.notify({ text: c().errors[code] ?? c().errors.unavailable }, true);
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { busy, act };
}

export const roleLabel = (role: string, c: (typeof organisationCopy)['en']) =>
  role === 'admin' ? c.roleAdmin : c.roleMember;
