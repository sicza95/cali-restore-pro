import {
  applyPreferences,
  loadPreferences,
  signedOutPreferences,
} from '../settings/preferences/utils';
import { offlineAccountKey, rememberOfflineAccount } from '../../platform/vault/offline-account';
import { createEffect, createMemo, createSignal, on, onCleanup, onMount } from 'solid-js';
import { checkConnection, requestAuth } from './api';
import { passkeyAssertion, passkeyConfirmation, passkeyRegistration } from './passkeys';
import { createIdentityCheck } from './identity-check';
import { sessionEndingActions } from './constants';
import { accountCopy as copy } from './copy';
import { authErrorMessage, authFormBody } from './utils';
import { isAccountDestination, signInDestination, signInLink } from '../router/routes';
import { accountPaths } from '../router/constants';
import { settleSignIn } from '../account/sign-in/remembered-accounts';
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
  // A copy key, or text a screen already wrote in the app language.
  const [message, setMessage] = createSignal<Message | { text: string }>();
  const [failed, setFailed] = createSignal(false);
  const [confirmedState, setConfirmedState] = createSignal(false);
  const confirmed = confirmedState;
  // A fresh sign-in or password confirmation allows security changes until the
  // server's window lapses; the server still checks every change.
  let confirmationTimer: ReturnType<typeof setTimeout> | undefined;
  const setConfirmed = (value: boolean, until?: string | null) => {
    clearTimeout(confirmationTimer);
    const left = value ? (until ? Date.parse(until) - Date.now() : 5 * 60_000) : 0;
    setConfirmedState(left > 0);
    if (left > 0) confirmationTimer = setTimeout(() => setConfirmedState(false), left);
  };
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
  const identity = createIdentityCheck();
  // Profile, Security and Preferences open the one Settings page, which lists the sessions.
  const isSettings = (name: string) => ['profile', 'security', 'preferences'].includes(name);
  // Sent when the server wants a fresh confirmation: the caller asks and tries once more.
  const needsConfirmation = Symbol('needs confirmation');
  /** A change the server refuses for want of a recent confirmation asks "Confirm it's you" first. */
  const run = async (action: string, body: object, success: Message) => {
    const first = await runOnce(action, body, success, true);
    if (first !== needsConfirmation) return first;
    if (!(await identity.ask())) return false;
    const second = await runOnce(action, body, success, false);
    return second === needsConfirmation ? false : second;
  };
  const runOnce = async (action: string, body: object, success: Message, mayAsk: boolean) => {
    if (busy()) return false;
    const requestPage = navigationGeneration;
    const generation = sessionGeneration;
    setBusy(true);
    setMessage(undefined);
    setFailed(false);
    try {
      const result = await api(action, body);
      if (!active || generation !== sessionGeneration) return false;
      // Setting a password with a sign-up or reset code signs the person in, like a password sign-in.
      if (action === 'login' || action === 'passkey-login' || action === 'code/complete') {
        clearSession(false);
        rememberOfflineAccount();
        sessionChanges?.postMessage(null);
        await refreshAccount();
        settleSignIn(account()?.email);
        if (requestPage === navigationGeneration)
          router.navigate(
            action === 'code/complete'
              ? accountPaths.projects
              : signInDestination(new URLSearchParams(location.search).get('next')),
          );
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
      // The new name and photo show at once in the navigation and on the profile page.
      if (action.startsWith('/admin/') || action === 'profile') {
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
      const code = error instanceof Error ? error.message : '';
      if (code === 'credential_confirmation_required') {
        setConfirmed(false);
        if (mayAsk) return needsConfirmation;
      }
      setFailed(true);
      setMessage(authErrorMessage(code));
      if (code === 'authentication_required') {
        clearSession();
      }
      return false;
    } finally {
      setBusy(false);
    }
  };
  // Passkey ceremonies talk to the authenticator before the identity request.
  const runPrepared = async (
    prepare: () => Promise<object>,
    action: string,
    success: Message,
    mayAsk = true,
  ): Promise<unknown> => {
    if (busy()) return false;
    setBusy(true);
    setMessage(undefined);
    setFailed(false);
    let body: object;
    try {
      body = await prepare();
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      if (code === 'credential_confirmation_required') {
        setConfirmed(false);
        if (mayAsk) {
          setBusy(false);
          return (await identity.ask()) && runPrepared(prepare, action, success, false);
        }
      }
      setFailed(true);
      setMessage(authErrorMessage(code));
      return false;
    } finally {
      setBusy(false);
    }
    return run(action, body, success);
  };
  /** The dialog's two ways to confirm; returns the problem to show inside it, if any. */
  const confirmIdentity = async (password?: string): Promise<Message | undefined> => {
    const generation = sessionGeneration;
    try {
      if (password === undefined) await api('confirm/passkey', await passkeyConfirmation(csrf()));
      else await api('confirm', { password });
      // A late answer after leaving the page confirms nothing here.
      if (generation !== sessionGeneration) return undefined;
      setConfirmed(true);
      identity.settle(true);
      return undefined;
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      return code === 'invalid_credentials' ? 'wrongPassword' : authErrorMessage(code);
    }
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
    setConfirmed(!!result.confirmedUntil, result.confirmedUntil);
    if (view() === 'invitations' || localStorage.getItem(offlineAccountKey) !== result.account?.id)
      rememberOfflineAccount(view() === 'invitations' ? result.account?.id : undefined);
  };
  const applyAccountPreferences = () => {
    const id = account()?.id;
    // An account left on "System" keeps the theme picked on this device (for example at sign-in).
    const device = signedOutPreferences();
    const own = id ? loadPreferences(id) : device;
    applyPreferences(own.theme === 'system' ? { ...own, theme: device.theme } : own);
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
      setSessions([]);
      setDeletionReceipt(undefined);
      void refreshAccount()
        .then(() => {
          if (generation === navigationGeneration && isSettings(destination) && account())
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
    clearTimeout(confirmationTimer);
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
    dismissMessage: () => setMessage(undefined),
    /** A floating message for changes saved in this browser, like settings. */
    notify: (text: Message | { text: string }, problem = false) => {
      setFailed(problem);
      setMessage(text);
    },
    refreshConnection,
    refreshSessions,
    revokeAll,
    revokeSession,
    selectLanguage,
    sessionError,
    sessions,
    signOut: async () => {
      rememberOfflineAccount();
      lockVault();
      const from = view();
      if ((await run('logout', {}, 'success')) === false) return;
      // Straight to the sign-in page (the remembered accounts), keeping the way back here.
      setMessage(undefined);
      router.navigate(isAccountDestination(from) ? signInLink(from, location.pathname) : '/login');
    },
    submit,
    identityCheck: { open: identity.open, cancel: () => identity.settle(false) },
    confirmIdentity,
    signInWithPasskey: () => void runPrepared(passkeyAssertion, 'passkey-login', 'success'),
    addPasskey: (name: string) =>
      runPrepared(() => passkeyRegistration(csrf(), name), 'passkeys/register', 'passkeyAdded'),
    t,
  };
}
