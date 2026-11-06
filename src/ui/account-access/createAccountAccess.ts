import {
  applyPreferences,
  loadPreferences,
  preferenceDefaults,
} from './settings/preferences/utils';
import { offlineAccountKey, rememberOfflineAccount } from '../../platform/vault/offline-account';
import { createEffect, createSignal, onCleanup, onMount } from 'solid-js';
import { checkConnection, requestAuth } from './api';
import { copy, sessionEndingActions } from './constants';
import { authErrorMessage, authFormBody } from './utils';
import { accountRoute, signInDestination } from './routes';
import { applyLanguage, storedLanguage } from './presentation';
import type { DeletionStatus } from '../../platform/api/types.gen';
import type { Account, Language, Message, Session } from './types';

export function createAccountAccess() {
  const [lang, setLang] = createSignal<Language>(storedLanguage());
  const t = (key: Message) => copy[lang()][key];
  const view = accountRoute(window.location.pathname);
  const linkToken = new URLSearchParams(window.location.hash.slice(1)).get('token') ?? '';
  if (linkToken) {
    document.getElementById('app')?.setAttribute('data-auth-link', '');
    history.replaceState(null, '', location.pathname + location.search);
  }
  const [deletionReceipt, setDeletionReceipt] = createSignal<DeletionStatus>();
  const [account, setAccount] = createSignal<Account>();
  const [capabilities, setCapabilities] = createSignal<string[]>([]);
  const [loaded, setLoaded] = createSignal(false);
  const can = (capability: string) => capabilities().includes(capability);
  const canAdmin = () => can('accounts.view') || can('operations.view');
  const [sessionUnavailable, setSessionUnavailable] = createSignal(false);
  const [csrf, setCsrf] = createSignal('');
  const [sessions, setSessions] = createSignal<Session[]>([]);
  const [busy, setBusy] = createSignal(false);
  const [message, setMessage] = createSignal<Message>();
  const [failed, setFailed] = createSignal(false);
  const [confirmed, setConfirmed] = createSignal(false);
  const [revokeConfirmed, setRevokeConfirmed] = createSignal(false);
  const [connection, setConnection] = createSignal<'checking' | 'ready' | 'unavailable'>(
    'checking',
  );
  const [sessionError, setSessionError] = createSignal(false);
  const selectLanguage = (value: Language) => {
    setLang(value);
    applyLanguage(value);
    try {
      localStorage.setItem('cr-language', value);
    } catch {
      // The current page can still use the selected language.
    }
  };

  const api = async (action: string, body?: object) => {
    const result = await requestAuth(action, csrf(), body);
    if (result.csrfToken) setCsrf(result.csrfToken);
    return result;
  };
  const lockVault = () => {
    window.dispatchEvent(new Event('calirestore-session-end'));
    const id = account()?.id;
    if (id && typeof BroadcastChannel !== 'undefined') {
      const channel = new BroadcastChannel('calirestore-vault');
      channel.postMessage(id);
      channel.close();
    }
  };
  let sessionChanges: BroadcastChannel | undefined;
  const clearSession = (notify = true) => {
    if (notify && account()) sessionChanges?.postMessage(account()?.id);
    window.dispatchEvent(new Event('calirestore-session-end'));
    if (localStorage.getItem(offlineAccountKey) === account()?.id) rememberOfflineAccount();
    setAccount(undefined);
    setCapabilities([]);
    setCsrf('');
    setSessions([]);
  };
  const refreshSessions = async () => {
    setSessionError(false);
    try {
      setSessions((await api('sessions')).sessions ?? []);
    } catch {
      setSessionError(true);
    }
  };
  const refreshConnection = async () => {
    setConnection('checking');
    setConnection(await checkConnection());
  };
  const run = async (action: string, body: object, success: Message) => {
    if (busy()) return false;
    setBusy(true);
    setMessage(undefined);
    setFailed(false);
    try {
      const result = await api(action, body);
      if (action === 'login') {
        rememberOfflineAccount();
        sessionChanges?.postMessage(null);
        window.location.assign(signInDestination(new URLSearchParams(location.search).get('next')));
        return;
      }
      if (
        action.endsWith('/deletion') &&
        result.id &&
        result.recoverUntil &&
        result.backupExpiresAt &&
        (action === '/account/deletion' || action.startsWith('/admin/accounts/'))
      ) {
        setDeletionReceipt({
          id: result.id,
          recoverUntil: result.recoverUntil,
          backupExpiresAt: result.backupExpiresAt,
        });
      }
      if (sessionEndingActions.includes(action)) {
        clearSession();
        setConfirmed(false);
      }
      if (action === 'confirm') setConfirmed(true);
      setMessage(success);
      if (action.startsWith('/admin/')) {
        try {
          await refreshAccount();
        } catch {
          clearSession();
        }
      }
      return result;
    } catch (error) {
      setFailed(true);
      const code = error instanceof Error ? error.message : '';
      setMessage(authErrorMessage(code));
      if (code === 'credential_confirmation_required') setConfirmed(false);
      if (code === 'authentication_required') {
        clearSession();
      }
      return false;
    } finally {
      setBusy(false);
    }
  };
  const submit = (event: SubmitEvent, action: string, success: Message) => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const body = authFormBody(form, action, lang(), linkToken);
    void run(action, body, success).finally(() => form.reset());
  };
  const read = async <T>(path: string) => {
    try {
      return await requestAuth<T>(path, csrf());
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      if (code === 'authentication_required') clearSession();
      setMessage(authErrorMessage(code));
      setFailed(true);
      return undefined;
    }
  };
  const refreshAccount = async () => {
    const result = await api('me');
    setCapabilities(result.capabilities ?? []);
    setAccount(result.account);
    if (view === 'invitations' || localStorage.getItem(offlineAccountKey) !== result.account?.id)
      rememberOfflineAccount(view === 'invitations' ? result.account?.id : undefined);
  };
  const applyAccountPreferences = () => {
    const id = account()?.id;
    applyPreferences(id ? loadPreferences(id) : preferenceDefaults);
  };
  createEffect(applyAccountPreferences);
  const deviceTheme = window.matchMedia('(prefers-color-scheme: dark)');
  onMount(() => {
    if (typeof BroadcastChannel !== 'undefined') {
      sessionChanges = new BroadcastChannel('calirestore-auth');
      sessionChanges.onmessage = ({ data }) => {
        if (account() && (data === null || data === account()?.id)) clearSession(false);
      };
    }
    deviceTheme.addEventListener('change', applyAccountPreferences);
    applyLanguage(lang());
    void refreshConnection();
    void refreshAccount()
      .then(() => {
        if (view === 'security') void refreshSessions();
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.message === 'authentication_required') {
          rememberOfflineAccount();
        } else {
          setSessionUnavailable(true);
          setMessage('unavailable');
          setFailed(true);
        }
      })
      .finally(() => setLoaded(true));
  });
  onCleanup(() => {
    sessionChanges?.close();
    deviceTheme.removeEventListener('change', applyAccountPreferences);
  });
  const revokeSession = async (session: Session) => {
    if (!(await run('sessions/revoke', { sessionId: session.id, confirm: true }, 'success')))
      return;
    if (session.current) clearSession();
    else await refreshSessions();
  };
  const revokeAll = async () => {
    if (await run('sessions/revoke', { all: true, confirm: true }, 'success')) clearSession();
  };

  return {
    account,
    deletionReceipt,
    can,
    canAdmin,
    sessionUnavailable,
    loaded,
    read,
    csrf,
    request: <T>(path: string, body?: object, method?: string) =>
      requestAuth<T>(path, csrf(), body, method),
    run,
    busy,
    confirmed,
    connection,
    failed,
    lang,
    linkToken,
    message,
    refreshConnection,
    refreshSessions,
    revokeAll,
    revokeConfirmed,
    revokeSession,
    selectLanguage,
    sessionError,
    sessions,
    setRevokeConfirmed,
    signOut: () => {
      rememberOfflineAccount();
      lockVault();
      void run('logout', {}, 'success');
    },
    submit,
    t,
    view,
  };
}
