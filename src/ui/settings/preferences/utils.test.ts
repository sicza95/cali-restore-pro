import { expect, it, vi } from 'vitest';
import { loadAccountSettings, preferenceDefaults } from './utils';

it('adapts the account-local area units and PNG logo without writing project defaults', () => {
  const getItem = vi.fn(() =>
    JSON.stringify({
      areaUnit: 'ft²',
      measurementUnits: 'imperial',
      currency: 'USD',
      snap: false,
      studio: '',
      logo: 'data:image/png;base64,AAAA',
    }),
  );
  vi.stubGlobal('localStorage', { getItem });
  const account = loadAccountSettings('account');
  expect(getItem).toHaveBeenCalledWith('cr-preferences:account');
  expect(account.restoration).toMatchObject({
    units: 'imperial',
    areaUnit: 'ft²',
    currency: 'USD',
    snap: false,
  });
  expect(account.branding).toMatchObject({
    studio: '',
    logo: { accountDataUrl: 'data:image/png;base64,AAAA' },
  });
});

it('falls back safely when storage is blocked or old values are unsupported', () => {
  vi.stubGlobal('localStorage', {
    getItem: () => {
      throw new Error('blocked');
    },
  });
  expect(loadAccountSettings('account').restoration.areaUnit).toBeNull();
  vi.stubGlobal('localStorage', {
    getItem: () =>
      JSON.stringify({
        areaUnit: 'bad',
        currency: 'bad',
        accent: 'red',
        logo: 'https://example.test/logo.png',
      }),
  });
  expect(loadAccountSettings('account')).toMatchObject({
    restoration: { areaUnit: null, currency: 'HUF' },
    branding: { accent: preferenceDefaults.accent, logo: null },
  });
});

it('treats the legacy display-only units value as unset so area follows the measurement system', () => {
  vi.stubGlobal('localStorage', {
    getItem: () => JSON.stringify({ units: 'cm²', measurementUnits: 'metric' }),
  });
  expect(loadAccountSettings('account').restoration.areaUnit).toBeNull();
  expect(loadAccountSettings().restoration.areaUnit).toBeNull();
});
