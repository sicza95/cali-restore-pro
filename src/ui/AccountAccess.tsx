import { For, Show, createSignal, onMount } from 'solid-js';

const copy = {
  en: {
    account: 'Your account',
    login: 'Sign in',
    register: 'Create account',
    'forgot-password': 'Reset access',
    'reset-password': 'Choose a new password',
    'verify-email': 'Verify email',
    'confirm-email': 'Confirm new email',
    security: 'Account security',
    email: 'Email address',
    password: 'Password',
    newPassword: 'New password',
    currentPassword: 'Current password',
    passwordHelp: 'Use at least 15 characters. Spaces and Unicode are welcome.',
    submit: 'Continue',
    working: 'Working…',
    logout: 'Sign out',
    forgot: 'Forgot your password?',
    resend: 'Resend verification',
    confirmPassword: 'Confirm password',
    changePassword: 'Change password',
    changeEmail: 'Change email',
    sessions: 'Signed-in sessions',
    current: 'This session',
    revoke: 'Revoke session',
    revokeAll: 'Sign out all sessions',
    confirmation: 'I confirm this security change.',
    sessionHelp:
      'Sessions stay signed in until you sign out or revoke them. Password and email changes sign out every session.',
    securityHelp:
      'Confirm your current password before changing credentials or revoking sessions. Confirmation lasts five minutes.',
    accessHelp: 'Sign in to your restoration account. Content unlock is a separate step.',
    upcoming: 'Project storage and restoration tools are coming in later releases.',
    neutral:
      'If this address is eligible, an email is queued. Check your inbox and spam folder. Delivery may take a few minutes.',
    success: 'Done. You can sign in with your current credentials.',
    confirmed: 'Password confirmed. You can now make a security change.',
    invalid: 'This link is invalid, expired or already used. Request a new email.',
    credentials: 'Check your email and password. The account must be verified and active.',
    unavailable: 'Connection unavailable. Please try again.',
    limited: 'Too many attempts. Please try again later.',
    recent: 'Confirm your current password again before continuing.',
    forbidden: 'This action is not permitted. Refresh and try again.',
    missingLink: 'Open the link from your email to continue.',
    signedOut: 'Sign in to manage your account security.',
    ready: 'Connected',
    checking: 'Checking connection…',
    check: 'Check connection',
    platform: 'Platform connection',
    sessionFailed: 'Could not load sessions. Try refreshing.',
    refresh: 'Refresh sessions',
    revokeHelp:
      'Revoking this session signs you out here. Revoking all sessions signs you out everywhere.',
  },
  hu: {
    account: 'A fiókod',
    login: 'Bejelentkezés',
    register: 'Fiók létrehozása',
    'forgot-password': 'Hozzáférés visszaállítása',
    'reset-password': 'Új jelszó megadása',
    'verify-email': 'E-mail-cím megerősítése',
    'confirm-email': 'Új e-mail-cím megerősítése',
    security: 'Fiókbiztonság',
    email: 'E-mail-cím',
    password: 'Jelszó',
    newPassword: 'Új jelszó',
    currentPassword: 'Jelenlegi jelszó',
    passwordHelp: 'Legalább 15 karakter. Szóközök és Unicode-karakterek is használhatók.',
    submit: 'Folytatás',
    working: 'Folyamatban…',
    logout: 'Kijelentkezés',
    forgot: 'Elfelejtetted a jelszavad?',
    resend: 'Megerősítő levél újraküldése',
    confirmPassword: 'Jelszó megerősítése',
    changePassword: 'Jelszó módosítása',
    changeEmail: 'E-mail-cím módosítása',
    sessions: 'Bejelentkezett munkamenetek',
    current: 'Ez a munkamenet',
    revoke: 'Munkamenet visszavonása',
    revokeAll: 'Minden munkamenet kijelentkeztetése',
    confirmation: 'Megerősítem ezt a biztonsági módosítást.',
    sessionHelp:
      'A munkamenetek kijelentkezésig vagy visszavonásig aktívak. A jelszó és az e-mail-cím módosítása minden munkamenetet kijelentkeztet.',
    securityHelp:
      'A módosítások és a munkamenetek visszavonása előtt erősítsd meg a jelenlegi jelszavad. A megerősítés öt percig érvényes.',
    accessHelp: 'Jelentkezz be a restaurálási fiókodba. A tartalom feloldása külön lépés.',
    upcoming: 'A projekttárolás és a restaurálási eszközök későbbi kiadásokban érkeznek.',
    neutral:
      'Ha a cím jogosult, a levél küldési sorba került. Nézd meg a beérkezett és a levélszemét mappát. A kézbesítés néhány percig tarthat.',
    success: 'Kész. Bejelentkezhetsz az aktuális adataiddal.',
    confirmed: 'Jelszó megerősítve. Most elvégezheted a biztonsági módosítást.',
    invalid: 'A hivatkozás érvénytelen, lejárt vagy már felhasználták. Kérj új levelet.',
    credentials:
      'Ellenőrizd az e-mail-címed és a jelszavad. A fióknak megerősítettnek és aktívnak kell lennie.',
    unavailable: 'A kapcsolat nem érhető el. Próbáld újra.',
    limited: 'Túl sok próbálkozás. Próbáld újra később.',
    recent: 'A folytatás előtt erősítsd meg újra a jelenlegi jelszavad.',
    forbidden: 'Ez a művelet nem engedélyezett. Frissítsd az oldalt, és próbáld újra.',
    missingLink: 'A folytatáshoz nyisd meg az e-mailben kapott hivatkozást.',
    signedOut: 'A fiókbiztonság kezeléséhez jelentkezz be.',
    ready: 'Csatlakoztatva',
    checking: 'Kapcsolat ellenőrzése…',
    check: 'Kapcsolat ellenőrzése',
    platform: 'Platformkapcsolat',
    sessionFailed: 'A munkamenetek nem tölthetők be. Próbálj frissíteni.',
    refresh: 'Munkamenetek frissítése',
    revokeHelp:
      'Ennek a munkamenetnek a visszavonása itt jelentkeztet ki. Az összes visszavonása mindenhol kijelentkeztet.',
  },
};
type Language = keyof typeof copy;
type Message = keyof typeof copy.en;
type Session = { id: string; createdAt: string; current: boolean };
type Account = { id: string; email: string; state: string; role: string };
type Route =
  | 'login'
  | 'register'
  | 'forgot-password'
  | 'reset-password'
  | 'verify-email'
  | 'confirm-email'
  | 'security';

export function AccountAccess() {
  const initialLanguage = localStorage.getItem('cr-language') === 'hu' ? 'hu' : 'en';
  const [lang, setLang] = createSignal<Language>(initialLanguage);
  const t = (key: Message) => copy[lang()][key];
  const path = window.location.pathname;
  const view: Route =
    path === '/settings/security'
      ? 'security'
      : ['register', 'forgot-password', 'reset-password', 'verify-email', 'confirm-email'].includes(
            path.slice(1),
          )
        ? (path.slice(1) as Route)
        : 'login';
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
    const response = await fetch(`/api/v1/auth/${action}`, {
      method: body ? 'POST' : 'GET',
      cache: 'no-store',
      credentials: 'same-origin',
      signal: AbortSignal.timeout(15000),
      headers: body ? { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf() } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    const result = (await response.json()) as {
      error?: string;
      csrfToken?: string;
      account?: Account;
      sessions?: Session[];
    };
    if (!response.ok) throw new Error(result.error ?? 'unavailable');
    if (result.csrfToken) setCsrf(result.csrfToken);
    return result;
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
    try {
      const response = await fetch('/api/v1/status', {
        cache: 'no-store',
        signal: AbortSignal.timeout(5000),
      });
      const data = (await response.json()) as { status: string };
      setConnection(response.ok && data.status === 'ready' ? 'ready' : 'unavailable');
    } catch {
      setConnection('unavailable');
    }
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
      if (['logout', 'change-password', 'reset-password', 'confirm-email'].includes(action)) {
        setAccount(undefined);
        setCsrf('');
        setSessions([]);
        setConfirmed(false);
      }
      if (action === 'confirm') setConfirmed(true);
      setMessage(success);
      return true;
    } catch (error) {
      setFailed(true);
      const code = error instanceof Error ? error.message : '';
      setMessage(
        (
          {
            invalid_or_expired_link: 'invalid',
            invalid_credentials: 'credentials',
            authentication_required: 'signedOut',
            try_later: 'limited',
            credential_confirmation_required: 'recent',
            not_permitted: 'forbidden',
          } as Record<string, Message>
        )[code] ?? 'unavailable',
      );
      if (code === 'credential_confirmation_required') setConfirmed(false);
      if (code === 'authentication_required') {
        setAccount(undefined);
        setCsrf('');
        setSessions([]);
      }
      return false;
    } finally {
      setBusy(false);
    }
  };
  const submit = (event: SubmitEvent, action: string, success: Message) => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const fields = new FormData(form);
    const email = String(fields.get('email') ?? '');
    const password = String(fields.get('password') ?? '');
    const confirm = fields.get('confirm') === 'on';
    const body =
      action === 'login'
        ? { email, password }
        : action === 'confirm'
          ? { password }
          : action === 'change-password'
            ? { password, confirm }
            : action === 'change-email'
              ? { email, confirm }
              : action === 'register'
                ? { email, password, language: lang() }
                : action === 'forgot-password' || action === 'resend-verification'
                  ? { email, language: lang() }
                  : action === 'reset-password'
                    ? { token: linkToken, password }
                    : { token: linkToken };
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
  const emailField = () => (
    <label>
      {t('email')}
      <input name="email" type="email" autocomplete="email" required maxlength={254} />
    </label>
  );
  const passwordField = (kind: 'password' | 'newPassword' | 'currentPassword') => (
    <label>
      {t(kind)}
      <input
        name="password"
        type="password"
        autocomplete={kind === 'newPassword' ? 'new-password' : 'current-password'}
        required
        minLength={15}
        maxlength={1024}
        aria-describedby={kind === 'newPassword' ? 'password-help' : undefined}
      />
    </label>
  );
  const confirmField = () => (
    <label class="confirmation">
      <input type="checkbox" name="confirm" required />
      {t('confirmation')}
    </label>
  );
  const submitButton = (key: Message = 'submit') => (
    <button type="submit" disabled={busy()}>
      {t(busy() ? 'working' : key)}
    </button>
  );
  const linkView = view === 'verify-email' || view === 'confirm-email' || view === 'reset-password';
  return (
    <div class="account-shell">
      <aside class="account-nav">
        <a class="product-name" href="/">
          <svg viewBox="0 0 32 32" width="24" height="24" aria-hidden="true">
            <path
              d="M25 8a11 11 0 1 0 0 16"
              fill="none"
              stroke="currentColor"
              stroke-width="4"
              stroke-linecap="round"
            />
          </svg>
          CaliRestore Pro
        </a>
        <p>{t('account')}</p>
        <nav aria-label={t('account')}>
          <Show
            when={account()}
            fallback={
              <>
                <a href="/login" aria-current={view === 'login' ? 'page' : undefined}>
                  {t('login')}
                </a>
                <a href="/register" aria-current={view === 'register' ? 'page' : undefined}>
                  {t('register')}
                </a>
              </>
            }
          >
            <a href="/settings/security" aria-current={view === 'security' ? 'page' : undefined}>
              {t('security')}
            </a>
            <button
              class="secondary"
              disabled={busy()}
              onClick={() => void run('logout', {}, 'success')}
            >
              {t('logout')}
            </button>
          </Show>
        </nav>
        <label class="language">
          Language / Nyelv
          <select
            value={lang()}
            onChange={(e) => selectLanguage(e.currentTarget.value as Language)}
          >
            <option value="en">English</option>
            <option value="hu">Magyar</option>
          </select>
        </label>
      </aside>
      <main class="account-content">
        <h1>{t(view)}</h1>
        <Show when={message()}>
          {(key) => (
            <p class="account-message" role={failed() ? 'alert' : 'status'} data-error={failed()}>
              {t(key())}
            </p>
          )}
        </Show>
        <Show
          when={view === 'security'}
          fallback={
            <section class="account-section">
              <div>
                <h2>{t(linkView ? view : 'account')}</h2>
                <p>{t('accessHelp')}</p>
              </div>
              <div class="account-panel">
                <Show when={!linkView || linkToken} fallback={<p>{t('missingLink')}</p>}>
                  <form
                    onSubmit={(e) =>
                      submit(
                        e,
                        view,
                        view === 'register' || view === 'forgot-password' ? 'neutral' : 'success',
                      )
                    }
                  >
                    <Show when={!linkView}>{emailField()}</Show>
                    <Show
                      when={view === 'login' || view === 'register' || view === 'reset-password'}
                    >
                      {passwordField(view === 'login' ? 'password' : 'newPassword')}
                    </Show>
                    <Show when={view === 'register' || view === 'reset-password'}>
                      <p id="password-help" class="field-help">
                        {t('passwordHelp')}
                      </p>
                    </Show>
                    {submitButton(view === 'login' ? 'login' : 'submit')}
                    <Show when={view === 'login'}>
                      <a href="/forgot-password">{t('forgot')}</a>
                    </Show>
                  </form>
                </Show>
                <Show when={view === 'login'}>
                  <a href="/verify-email">{t('resend')}</a>
                </Show>
                <Show when={view === 'verify-email'}>
                  <details>
                    <summary>{t('resend')}</summary>
                    <form onSubmit={(e) => submit(e, 'resend-verification', 'neutral')}>
                      {emailField()}
                      {submitButton('resend')}
                    </form>
                  </details>
                </Show>
              </div>
            </section>
          }
        >
          <Show
            when={account()}
            fallback={
              <p>
                {t('signedOut')} <a href="/login">{t('login')}</a>
              </p>
            }
          >
            {(owner) => (
              <>
                <p class="account-email">{owner().email}</p>
                <section class="account-section">
                  <div>
                    <h2>{t('confirmPassword')}</h2>
                    <p>{t('securityHelp')}</p>
                  </div>
                  <form class="account-panel" onSubmit={(e) => submit(e, 'confirm', 'confirmed')}>
                    {passwordField('currentPassword')}
                    {submitButton('confirmPassword')}
                  </form>
                </section>
                <section class="account-section">
                  <div>
                    <h2>{t('changePassword')}</h2>
                    <p id="password-help">{t('passwordHelp')}</p>
                  </div>
                  <form
                    class="account-panel"
                    onSubmit={(e) => submit(e, 'change-password', 'success')}
                  >
                    {passwordField('newPassword')}
                    {confirmField()}
                    <button disabled={busy() || !confirmed()}>{t('changePassword')}</button>
                  </form>
                </section>
                <section class="account-section">
                  <div>
                    <h2>{t('changeEmail')}</h2>
                    <p>{t('neutral')}</p>
                  </div>
                  <form
                    class="account-panel"
                    onSubmit={(e) => submit(e, 'change-email', 'neutral')}
                  >
                    {emailField()}
                    {confirmField()}
                    <button disabled={busy() || !confirmed()}>{t('changeEmail')}</button>
                  </form>
                </section>
                <section class="account-section">
                  <div>
                    <h2>{t('sessions')}</h2>
                    <p>{t('sessionHelp')}</p>
                    <p>{t('revokeHelp')}</p>
                  </div>
                  <div class="account-panel">
                    <Show when={sessionError()}>
                      <p role="alert">{t('sessionFailed')}</p>
                    </Show>
                    <button
                      class="secondary"
                      disabled={busy()}
                      onClick={() => void refreshSessions()}
                    >
                      {t('refresh')}
                    </button>
                    <label class="confirmation">
                      <input
                        type="checkbox"
                        checked={revokeConfirmed()}
                        onChange={(e) => setRevokeConfirmed(e.currentTarget.checked)}
                      />
                      {t('confirmation')}
                    </label>
                    <ul class="session-list">
                      <For each={sessions()}>
                        {(session) => (
                          <li>
                            <span>
                              <Show when={session.current}>{t('current')} · </Show>
                              <time datetime={session.createdAt}>
                                {new Date(session.createdAt).toLocaleString(lang())}
                              </time>
                            </span>
                            <button
                              class="secondary"
                              disabled={busy() || !confirmed() || !revokeConfirmed()}
                              onClick={async () => {
                                const revoked = await run(
                                  'sessions/revoke',
                                  { sessionId: session.id, confirm: true },
                                  'success',
                                );
                                if (!revoked) return;
                                if (session.current) {
                                  setAccount(undefined);
                                  setCsrf('');
                                  setSessions([]);
                                } else await refreshSessions();
                              }}
                            >
                              {t('revoke')}
                            </button>
                          </li>
                        )}
                      </For>
                    </ul>
                    <button
                      class="secondary"
                      disabled={busy() || !confirmed() || !revokeConfirmed()}
                      onClick={async () => {
                        if (
                          !(await run('sessions/revoke', { all: true, confirm: true }, 'success'))
                        )
                          return;
                        setAccount(undefined);
                        setCsrf('');
                        setSessions([]);
                      }}
                    >
                      {t('revokeAll')}
                    </button>
                  </div>
                </section>
              </>
            )}
          </Show>
        </Show>
        <footer>
          <p>{t('upcoming')}</p>
          <section aria-label={t('platform')}>
            <span role="status">{t(connection())}</span>
            <button
              class="secondary"
              disabled={connection() === 'checking'}
              onClick={() => void refreshConnection()}
            >
              {t('check')}
            </button>
          </section>
        </footer>
      </main>
    </div>
  );
}
