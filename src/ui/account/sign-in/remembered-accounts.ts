/**
 * Accounts the person chose to remember on this device ("Remember me" on the sign-in page). Only
 * the email address and when it was last used are kept, in this browser's local storage, so the
 * sign-in page can offer them as a list. No credential or session data is stored here.
 */
export type RememberedAccount = { email: string; lastUsed: number };

export const rememberedAccountsKey = 'calirestore.remembered-accounts';
export const rememberedAccountLimit = 5;

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

function isRemembered(value: unknown): value is RememberedAccount {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.email === 'string' &&
    entry.email.includes('@') &&
    entry.email.length <= 254 &&
    typeof entry.lastUsed === 'number'
  );
}

/** Newest first. A missing, unreadable or malformed list reads as empty. */
export function readRemembered(store: Store = localStorage): RememberedAccount[] {
  try {
    const parsed: unknown = JSON.parse(store.getItem(rememberedAccountsKey) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(isRemembered)
      .sort((a, b) => b.lastUsed - a.lastUsed)
      .slice(0, rememberedAccountLimit);
  } catch {
    return [];
  }
}

function write(list: RememberedAccount[], store: Store) {
  try {
    if (list.length) store.setItem(rememberedAccountsKey, JSON.stringify(list));
    else store.removeItem(rememberedAccountsKey);
  } catch {
    // Storage can be full or blocked (private browsing); remembering is a convenience only.
  }
}

/** Moves the account to the top of the list, adding it if needed. */
export function rememberAccount(email: string, store: Store = localStorage, now = Date.now()) {
  const rest = readRemembered(store).filter((entry) => !same(entry.email, email));
  write([{ email: email.trim(), lastUsed: now }, ...rest].slice(0, rememberedAccountLimit), store);
}

export function forgetAccount(email: string, store: Store = localStorage) {
  write(
    readRemembered(store).filter((entry) => !same(entry.email, email)),
    store,
  );
}

/** First letter of the address, for the account's round badge. */
export function accountInitial(email: string) {
  return (email.trim()[0] ?? '?').toLocaleUpperCase();
}

/*
 * The sign-in page records what the person asked for just before it sends a sign-in request; the
 * account session applies it once the server accepted the sign-in and returned the account. A
 * failed sign-in therefore never adds an address to the list.
 */
let intent: { remember: boolean; email?: string } | undefined;

export function setSignInIntent(next: { remember: boolean; email?: string }) {
  intent = next;
}

export function settleSignIn(accountEmail: string | undefined, store: Store = localStorage) {
  const pending = intent;
  intent = undefined;
  noteTypedEmail('');
  if (!pending || !accountEmail) return;
  if (pending.remember) rememberAccount(accountEmail, store);
  else {
    forgetAccount(accountEmail, store);
    if (pending.email) forgetAccount(pending.email, store);
  }
}

const typedEmailKey = 'calirestore.sign-in-email';

/**
 * The address typed or chosen on the sign-in page, kept for this tab only, so "Can’t sign in?"
 * starts with it filled in. A successful sign-in clears it.
 */
export function noteTypedEmail(email: string) {
  try {
    if (email) sessionStorage.setItem(typedEmailKey, email);
    else sessionStorage.removeItem(typedEmailKey);
  } catch {
    // Storage can be unavailable (private mode); the field then starts empty.
  }
}

/**
 * Reads and strips `#email=` from a sign-in link (the "you already have an account" email), so
 * the sign-in page starts with that address and it does not stay in the address bar or history.
 */
export function takeLinkedEmail() {
  const email = new URLSearchParams(location.hash.slice(1)).get('email')?.trim() ?? '';
  if (email) history.replaceState(history.state, '', location.pathname + location.search);
  return email;
}

export function typedEmail() {
  try {
    return sessionStorage.getItem(typedEmailKey) ?? '';
  } catch {
    return '';
  }
}
