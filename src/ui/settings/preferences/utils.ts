import type { AccountSettings } from '../../../platform/projects/settings';
import type { AreaUnit } from '../../../platform/estimates/types';
import { parseLanguage } from '../../../platform/i18n/language';

export const preferenceDefaults = {
  theme: 'system',
  opaque: false,
  /** Legacy display choice; it never drove estimates or reports and is no longer read. */
  units: 'cm²',
  /** Explicit account area unit; empty follows the measurement system (m² or ft²). */
  areaUnit: '',
  measurementUnits: 'metric',
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

/** Adapt the existing browser-local format; data URLs stay at the account boundary. */
export function loadAccountSettings(accountId?: string): AccountSettings {
  const value = accountId ? loadPreferences(accountId) : preferenceDefaults;
  const areaUnits: AreaUnit[] = ['cm²', 'm²', 'in²', 'ft²'];
  const areaUnit = areaUnits.includes(value.areaUnit as AreaUnit)
    ? (value.areaUnit as AreaUnit)
    : null;
  return {
    restoration: {
      units: value.measurementUnits === 'imperial' ? 'imperial' : 'metric',
      areaUnit,
      currency: /^[A-Z]{3}$/.test(value.currency) ? value.currency : 'HUF',
      reportLanguage: parseLanguage(value.reportLanguage),
      snap: value.snap === true,
    },
    branding: {
      studio: typeof value.studio === 'string' ? value.studio : '',
      contact: typeof value.contact === 'string' ? value.contact : '',
      footer: typeof value.footer === 'string' ? value.footer : '',
      accent: /^#[a-f0-9]{6}$/i.test(value.accent) ? value.accent : '#000000',
      logo: /^data:image\/png;base64,[a-z0-9+/=]+$/i.test(value.logo)
        ? { accountDataUrl: value.logo }
        : null,
    },
  };
}

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

export type ThemeChoice = 'light' | 'dark' | 'system';

/** What the person chose: the account's own choice, else this device's, else the device setting. */
export function themeChoice(accountId?: string): ThemeChoice {
  const own = accountId ? loadPreferences(accountId).theme : 'system';
  const theme = own === 'light' || own === 'dark' ? own : signedOutPreferences().theme;
  return theme === 'light' || theme === 'dark' ? theme : 'system';
}

/** Keeps the choice for the account (signed out, for this device) and applies it at once. */
export function chooseTheme(accountId: string | undefined, theme: ThemeChoice) {
  const value = { ...(accountId ? loadPreferences(accountId) : preferenceDefaults), theme };
  try {
    if (accountId) localStorage.setItem('cr-preferences:' + accountId, JSON.stringify(value));
    else if (theme !== 'system') localStorage.setItem(signedOutThemeKey, theme);
    // "System" means the device setting, so a theme picked on the sign-in page stops applying.
    if (theme === 'system') localStorage.removeItem(signedOutThemeKey);
  } catch {
    /* Still switch for this page when storage is blocked. */
  }
  applyPreferences(value);
  window.dispatchEvent(new CustomEvent(themeChangeEvent, { detail: theme }));
}

/** Flips between light and dark (the sign-in page's toggle). */
export function toggleTheme(accountId?: string) {
  chooseTheme(accountId, document.body.dataset.theme === 'dark' ? 'light' : 'dark');
}
