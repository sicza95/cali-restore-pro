export const preferenceDefaults = {
  theme: 'system',
  opaque: false,
  units: 'cm²',
  currency: 'HUF',
  reportLanguage: 'en',
  snap: false,
  studio: '',
  contact: '',
  footer: '',
  accent: '#000000',
  logo: '',
  diagnostics: false,
};

export function loadPreferences(accountId: string) {
  try {
    const value: unknown = JSON.parse(localStorage.getItem('cr-preferences:' + accountId) ?? '{}');
    if (value && typeof value === 'object') return { ...preferenceDefaults, ...value };
  } catch {
    /* The device may block storage. */
  }
  return preferenceDefaults;
}

export function savePreferences(accountId: string, value: typeof preferenceDefaults) {
  localStorage.setItem('cr-preferences:' + accountId, JSON.stringify(value));
  applyPreferences(value);
}

export function applyPreferences(value: typeof preferenceDefaults) {
  document.body.dataset.theme =
    value.theme === 'dark' || value.theme === 'light'
      ? value.theme
      : window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
  document.body.dataset.transparency = value.opaque ? 'opaque' : 'auto';
}

/** Theme chosen with the top-bar toggle while signed out; signed in, the account preference wins. */
const signedOutThemeKey = 'cr-theme';
export const themeChangeEvent = 'cr-theme-change';

export function signedOutPreferences(): typeof preferenceDefaults {
  let theme = 'system';
  try {
    const stored = localStorage.getItem(signedOutThemeKey);
    if (stored === 'light' || stored === 'dark') theme = stored;
  } catch {
    /* The device may block storage. */
  }
  return { ...preferenceDefaults, theme };
}

/** Flips between light and dark and keeps the choice (account preference or this device). */
export function toggleTheme(accountId?: string) {
  const theme = document.body.dataset.theme === 'dark' ? 'light' : 'dark';
  const value = { ...(accountId ? loadPreferences(accountId) : preferenceDefaults), theme };
  try {
    if (accountId) localStorage.setItem('cr-preferences:' + accountId, JSON.stringify(value));
    else localStorage.setItem(signedOutThemeKey, theme);
  } catch {
    /* Still switch for this page when storage is blocked. */
  }
  applyPreferences(value);
  window.dispatchEvent(new CustomEvent(themeChangeEvent, { detail: theme }));
}
