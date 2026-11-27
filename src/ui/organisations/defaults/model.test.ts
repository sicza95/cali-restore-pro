import { afterEach, expect, it, vi } from 'vitest';
import { defaultsRoot, organisationDefaults } from './model';
import { resolveSettings } from '../../../platform/projects/settings';
import { settingsProject } from '../../../platform/projects/settings/test-fixtures';

afterEach(() => vi.unstubAllGlobals());

it('preserves old values only for Personal and separates saved organisation defaults', () => {
  vi.stubGlobal('localStorage', {
    getItem: () =>
      JSON.stringify({
        measurementUnits: 'imperial',
        currency: 'USD',
        studio: 'Personal studio',
        snap: true,
      }),
  });
  const personal = organisationDefaults({ personal: true }, 'account');
  const shared = organisationDefaults({ personal: false }, 'account');
  expect(personal.restoration).toMatchObject({ units: 'imperial', currency: 'USD' });
  expect(personal.branding.studio).toBe('Personal studio');
  expect(shared.restoration).toMatchObject({ units: 'metric', currency: 'HUF' });
  expect(shared.branding.studio).toBe('');
  const saved = { ...shared, branding: { ...shared.branding, studio: 'Server Personal' } };
  expect(organisationDefaults({ personal: true, defaults: saved }, 'account').branding.studio).toBe(
    'Server Personal',
  );
  expect(shared.restoration).not.toHaveProperty('snap');
});

it('inherits organisation values while keeping snap personal and child overrides authoritative', () => {
  const org = organisationDefaults(undefined);
  org.restoration = { ...org.restoration, units: 'imperial', areaUnit: null, currency: 'USD' };
  org.branding.studio = 'Team studio';
  const root = defaultsRoot(org, true);
  const project = settingsProject();
  const before = structuredClone(project);
  const resolved = resolveSettings(root, project);
  expect(resolved.restoration.units).toEqual({ value: 'imperial', source: 'organisation' });
  expect(resolved.restoration.areaUnit).toEqual({ value: 'ft²', source: 'organisation' });
  expect(resolved.restoration.snap).toEqual({ value: true, source: 'account' });
  expect(resolved.branding.studio).toEqual({ value: 'Team studio', source: 'organisation' });
  expect(project).toEqual(before);
  project.overrides = {
    restoration: { units: 'metric', currency: 'EUR' },
    branding: { studio: 'Project studio' },
  };
  expect(resolveSettings(root, project).branding.studio).toEqual({
    value: 'Project studio',
    source: 'project',
  });
  expect(resolveSettings(root, project).restoration.currency).toEqual({
    value: 'EUR',
    source: 'project',
  });
});
