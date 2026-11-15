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
