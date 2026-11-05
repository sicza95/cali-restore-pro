import { createSignal, onMount } from 'solid-js';
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
  const clearSession = () => {
    setAccount(undefined);
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
        window.location.assign('/settings/security');
        return;
      }
      if (sessionEndingActions.includes(action)) {
        clearSession();
        setConfirmed(false);
      }
      if (action === 'confirm') setConfirmed(true);
      setMessage(success);
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
  onMount(() => {
    document.documentElement.lang = lang();
    void refreshConnection();
    void api('me')
      .then((result) => {
        setAccount(result.account);
        if (view === 'security') void refreshSessions();
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.message !== 'authentication_required') {
          setMessage('unavailable');
          setFailed(true);
        }
      });
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
    signOut: () => void run('logout', {}, 'success'),
    submit,
    t,
    view,
  };
}
