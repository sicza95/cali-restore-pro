import {
  applyPreferences,
  loadPreferences,
  preferenceDefaults,
} from '../settings/preferences/utils';
import { offlineAccountKey, rememberOfflineAccount } from '../../platform/vault/offline-account';
import { createEffect, createMemo, createSignal, on, onCleanup, onMount } from 'solid-js';
import { checkConnection, requestAuth } from './api';
import { passkeyAssertion, passkeyRegistration } from './passkeys';
import { sessionEndingActions } from './constants';
import { accountCopy as copy } from './copy';
import { authErrorMessage, authFormBody } from './utils';
import { signInDestination } from '../router/routes';
import type { Router } from '../router/createRouter';
import type { RouteName } from '../router/types';
import { applyLanguage, storedLanguage } from './presentation';
import type { DeletionStatus } from '../../platform/api/types.gen';
import type { Account, Language, Message, Session } from './types';

export function createAccountAccess(router: Router) {
  const [lang, setLang] = createSignal<Language>(storedLanguage());
  const t = (key: Message) => copy[lang()][key];
  const view = createMemo(() => router.route().name);
  const { linkToken } = router;
  const [deletionReceipt, setDeletionReceipt] = createSignal<DeletionStatus>();
  const [account, setAccount] = createSignal<Account>();
  const [capabilities, setCapabilities] = createSignal<string[]>([]);
  const [loadedState, setLoaded] = createSignal(false);
  const [checkedView, setCheckedView] = createSignal<RouteName>();
  const loaded = () => loadedState() && checkedView() === view();
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
    const generation = sessionGeneration;
    const result = await requestAuth(action, csrf(), body);
    if (generation === sessionGeneration && result.csrfToken) setCsrf(result.csrfToken);
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
  let sessionGeneration = 0;
  let navigationGeneration = 0;
  let active = true;
  const clearSession = (notify = true) => {
    sessionGeneration++;
    if (notify && account()) sessionChanges?.postMessage(account()?.id);
    window.dispatchEvent(new Event('calirestore-session-end'));
    if (localStorage.getItem(offlineAccountKey) === account()?.id) rememberOfflineAccount();
    setAccount(undefined);
    setCapabilities([]);
    setCsrf('');
    setSessions([]);
    setConfirmed(false);
    setRevokeConfirmed(false);
  };
  const refreshSessions = async () => {
    const generation = sessionGeneration;
    setSessionError(false);
    try {
      const result = await api('sessions');
      if (generation === sessionGeneration) setSessions(result.sessions ?? []);
    } catch {
      if (generation === sessionGeneration) setSessionError(true);
    }
  };
  const refreshConnection = async () => {
    setConnection('checking');
    setConnection(await checkConnection());
  };
  const run = async (action: string, body: object, success: Message) => {
    if (busy()) return false;
    const requestPage = navigationGeneration;
    const generation = sessionGeneration;
    setBusy(true);
    setMessage(undefined);
    setFailed(false);
    try {
      const result = await api(action, body);
      if (!active || generation !== sessionGeneration) return false;
      if (action === 'login' || action === 'passkey-login') {
        clearSession(false);
        rememberOfflineAccount();
        sessionChanges?.postMessage(null);
        await refreshAccount();
        if (requestPage === navigationGeneration)
          router.navigate(signInDestination(new URLSearchParams(location.search).get('next')));
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
      if (requestPage !== navigationGeneration) return result;
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
      if (!active || requestPage !== navigationGeneration || generation !== sessionGeneration)
        return false;
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
  // Passkey ceremonies talk to the authenticator before the identity request.
  const runPrepared = async (prepare: () => Promise<object>, action: string, success: Message) => {
    if (busy()) return false;
    setBusy(true);
    setMessage(undefined);
    setFailed(false);
    let body: object;
    try {
      body = await prepare();
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      if (code === 'credential_confirmation_required') setConfirmed(false);
      setFailed(true);
      setMessage(authErrorMessage(code));
      return false;
    } finally {
      setBusy(false);
    }
    return run(action, body, success);
  };
  const submit = (event: SubmitEvent, action: string, success: Message) => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const body = authFormBody(form, action, lang(), linkToken());
    void run(action, body, success).finally(() => form.reset());
  };
  const read = async <T>(path: string) => {
    const generation = sessionGeneration;
    const requestPage = navigationGeneration;
    try {
      return await requestAuth<T>(path, csrf());
    } catch (error) {
      if (!active || requestPage !== navigationGeneration || generation !== sessionGeneration)
        return undefined;
      const code = error instanceof Error ? error.message : '';
      if (code === 'authentication_required') clearSession();
      setMessage(authErrorMessage(code));
      setFailed(true);
      return undefined;
    }
  };
  const refreshAccount = async () => {
    const generation = ++sessionGeneration;
    const result = await requestAuth('me', csrf());
    if (generation !== sessionGeneration) return;
    if (account() && account()?.id !== result.account?.id) clearSession(false);
    setCsrf(result.csrfToken ?? '');
    setCapabilities(result.capabilities ?? []);
    setAccount(result.account);
    if (view() === 'invitations' || localStorage.getItem(offlineAccountKey) !== result.account?.id)
      rememberOfflineAccount(view() === 'invitations' ? result.account?.id : undefined);
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
  });
  // Account transitions used to load a new document: recheck rights and reset transient state.
  // Project subroutes keep their mounted vault and drawing workspace.
  createEffect(
    on(view, (destination) => {
      const generation = ++navigationGeneration;
      setLoaded(false);
      setSessionUnavailable(false);
      setMessage(undefined);
      setFailed(false);
      setConfirmed(false);
      setRevokeConfirmed(false);
      setSessions([]);
      setDeletionReceipt(undefined);
      void refreshAccount()
        .then(() => {
          if (generation === navigationGeneration && destination === 'security' && account())
            void refreshSessions();
        })
        .catch((error: unknown) => {
          if (generation !== navigationGeneration) return;
          clearSession(false);
          if (error instanceof Error && error.message === 'authentication_required') {
            rememberOfflineAccount();
          } else {
            setSessionUnavailable(true);
            setMessage('unavailable');
            setFailed(true);
          }
        })
        .finally(() => {
          if (generation === navigationGeneration) {
            setCheckedView(destination);
            setLoaded(true);
          }
        });
    }),
  );
  onCleanup(() => {
    active = false;
    navigationGeneration++;
    sessionGeneration++;
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
    signInWithPasskey: () => void runPrepared(passkeyAssertion, 'passkey-login', 'success'),
    addPasskey: (name: string) =>
      runPrepared(() => passkeyRegistration(csrf(), name), 'passkeys/register', 'passkeyAdded'),
    t,
  };
}
