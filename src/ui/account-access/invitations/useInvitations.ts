import { createResource, createSignal } from 'solid-js';
import type { Invitation, InvitationModel } from './types';

export function useInvitations<T extends Invitation>(model: InvitationModel, path: string) {
  const [busy, setBusy] = createSignal(false);
  const [failed, setFailed] = createSignal(false);
  const [result, { refetch }] = createResource<{ invitations?: T[]; error?: string }>(async () => {
    try {
      return await model.request<{ invitations: T[] }>(path);
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'unavailable' };
    }
  });
  const rows = () => result()?.invitations ?? [];
  const error = () => result()?.error;
  async function run(action: () => Promise<unknown>, refresh = true) {
    if (busy()) return false;
    setBusy(true);
    setFailed(false);
    try {
      await action();
      if (refresh) await refetch();
      return true;
    } catch {
      setFailed(true);
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { busy, failed, rows, error, loading: () => result.loading, run, refetch };
}
