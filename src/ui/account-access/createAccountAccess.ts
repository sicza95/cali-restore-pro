import {
  applyPreferences,
  loadPreferences,
  preferenceDefaults,
} from './settings/preferences/utils';
import { createEffect, createSignal, onCleanup, onMount } from 'solid-js';
import { checkConnection, requestAuth } from './api';
import { copy, sessionEndingActions } from './constants';
import { accountRoute, authErrorMessage, authFormBody } from './utils';
import type { Account, Language, Message, Session } from './types';

export function createAccountAccess() {
  const initialLanguage = localStorage.getItem('cr-language') === 'hu' ? 'hu' : 'en';
  const [lang, setLang] = createSignal<Language>(initialLanguage);
  const t = (key: Message) => copy[lang()][key];
  const view = accountRoute(window.location.pathname);
  const linkToken = new URLSearchParams(window.location.hash.slice(1)).get('token') ?? '';
  if (window.location.hash) history.replaceState(null, '', window.location.pathname);
  const [account, setAccount] = createSignal<Account>();
  const [capabilities, setCapabilities] = createSignal<string[]>([]);
  const [loaded, setLoaded] = createSignal(false);
  const can = (capability: string) => capabilities().includes(capability);
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
    localStorage.setItem('cr-language', value);
    document.documentElement.lang = value;
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
      await api(action, body);
      if (action === 'login') {
        sessionChanges?.postMessage(null);
        window.location.assign('/settings/security');
        return;
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
      return true;
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
    document.documentElement.lang = lang();
    void refreshConnection();
    void refreshAccount()
      .then(() => {
        if (view === 'security') void refreshSessions();
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.message !== 'authentication_required') {
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
    can,
    loaded,
    read,
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
      lockVault();
      void run('logout', {}, 'success');
    },
    submit,
    t,
    view,
  };
}
