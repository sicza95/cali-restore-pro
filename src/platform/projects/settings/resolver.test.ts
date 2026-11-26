import { describe, expect, it } from 'vitest';
import { resolveSettings } from './resolver';
import { resetLegacyUnits, resetOverride } from './reset';
import {
  editableEntityOverrides,
  applyEntityOverrides,
  preserveLegacyProjectSettings,
} from './legacy';
import { accountSettings, settingsProject } from './test-fixtures';

const target = { objectId: 'object', surfaceId: 'surface' };
describe('inherited settings', () => {
  it('preserves v1 project settings through an integration upgrade without mutating them', () => {
    const project = settingsProject();
    project.version = 1;
    const before = structuredClone(project);
    const upgraded = { ...preserveLegacyProjectSettings(project), version: 2 as const };
    expect(resolveSettings(accountSettings(), upgraded).restoration.units).toEqual({
      value: 'imperial',
      source: 'project',
    });
    expect(resolveSettings(accountSettings(), upgraded).restoration.currency).toEqual({
      value: 'EUR',
      source: 'project',
    });
    expect(project).toEqual(before);
    expect(preserveLegacyProjectSettings(upgraded)).toBe(upgraded);
  });
  it('returns account values and sources for every field without rewriting documents', () => {
    const account = accountSettings();
    const project = settingsProject();
    const before = structuredClone(project);
    const resolved = resolveSettings(account, project, target);
    for (const group of ['restoration', 'branding'] as const)
      for (const field of Object.values(resolved[group])) expect(field.source).toBe('account');
    expect(resolved.restoration.units.value).toBe('metric');
    expect(resolved.branding.logo.value).toEqual(account.branding.logo);
    expect(project).toEqual(before);
  });

  it('resolves each field independently through project, object and surface', () => {
    const project = settingsProject();
    project.overrides = {
      restoration: { currency: 'USD', reportLanguage: 'hu', snap: false },
      branding: { studio: 'Project studio', logo: { assetId: 'logo' } },
    };
    const object = project.objects[0]!;
    object.overrides = { restoration: { areaUnit: 'ft²' }, branding: { contact: '' } };
    object.surfaces[0]!.overrides = {
      restoration: { units: 'imperial' },
      branding: { footer: '', logo: null },
    };
    const resolved = resolveSettings(accountSettings(), project, target);
    expect(resolved.restoration).toEqual({
      units: { value: 'imperial', source: 'surface' },
      areaUnit: { value: 'ft²', source: 'object' },
      currency: { value: 'USD', source: 'project' },
      reportLanguage: { value: 'hu', source: 'project' },
      snap: { value: false, source: 'project' },
    });
    expect(resolved.branding.contact).toEqual({ value: '', source: 'object' });
    expect(resolved.branding.footer).toEqual({ value: '', source: 'surface' });
    expect(resolved.branding.logo).toEqual({ value: null, source: 'surface' });
    expect(resolved.branding.accent.source).toBe('account');
    expect(resolveSettings(accountSettings(), project).branding.studio.value).toBe(
      'Project studio',
    );
    expect(
      resolveSettings(accountSettings(), project, { objectId: 'object' }).branding.logo.value,
    ).toEqual({ assetId: 'logo' });
  });

  it('keeps v1 project settings and legacy child units, preferring explicit overrides', () => {
    const project = settingsProject();
    project.version = 1;
    const object = project.objects[0]!;
    object.units = 'metric';
    object.surfaces[0]!.units = 'imperial';
    expect(resolveSettings(accountSettings(), project).restoration.units).toEqual({
      value: 'imperial',
      source: 'project',
    });
    expect(resolveSettings(accountSettings(), project).restoration.currency.value).toBe('EUR');
    expect(
      resolveSettings(accountSettings(), project, { objectId: 'object' }).restoration.units.source,
    ).toBe('object');
    expect(resolveSettings(accountSettings(), project, target).restoration.units).toEqual({
      value: 'imperial',
      source: 'surface',
    });
    object.surfaces[0]!.overrides = { restoration: { units: 'metric' } };
    expect(resolveSettings(accountSettings(), project, target).restoration.units.value).toBe(
      'metric',
    );
  });

  it('rejects paths outside the target hierarchy and ignores illegal child currencies', () => {
    const project = settingsProject();
    expect(() => resolveSettings(accountSettings(), project, { surfaceId: 'surface' })).toThrow();
    expect(() => resolveSettings(accountSettings(), project, { objectId: 'missing' })).toThrow();
    expect(() =>
      resolveSettings(accountSettings(), project, { objectId: 'object', surfaceId: 'missing' }),
    ).toThrow();
    project.objects[0]!.overrides = JSON.parse('{"restoration":{"currency":"USD","snap":false}}');
    expect(resolveSettings(accountSettings(), project, target).restoration.currency).toEqual({
      value: 'HUF',
      source: 'account',
    });
  });

  it('reset deletes fields and empty groups while preserving explicit siblings', () => {
    const overrides = { restoration: { snap: false }, branding: { studio: '', logo: null } };
    expect(resetOverride(overrides, 'branding', 'studio')).toEqual({
      restoration: { snap: false },
      branding: { logo: null },
    });
    expect(resetOverride(overrides, 'restoration', 'snap')).toEqual({
      branding: { studio: '', logo: null },
    });
    expect(overrides.restoration.snap).toBe(false);
  });

  it('legacy unit editing and reset cannot resurrect an old value', () => {
    const project = settingsProject();
    const object = project.objects[0]!;
    object.units = 'imperial';
    const editable = editableEntityOverrides(object);
    expect(editable.restoration?.units).toBe('imperial');
    project.objects[0] = applyEntityOverrides(
      object,
      resetOverride(editable, 'restoration', 'units'),
    );
    expect(resolveSettings(accountSettings(), project, target).restoration.units.source).toBe(
      'account',
    );
    expect(
      resetLegacyUnits({ ...object, overrides: { restoration: { snap: false, units: 'metric' } } }),
    ).toMatchObject({ units: null, overrides: { restoration: { snap: false } } });
  });
  it('derives an unset account area unit from the effective measurement system', () => {
    const account = accountSettings();
    account.restoration.areaUnit = null;
    const project = settingsProject();
    project.settings.units = 'metric';
    expect(resolveSettings(account, project, target).restoration.areaUnit).toEqual({
      value: 'm²',
      source: 'account',
    });
    project.overrides = { restoration: { units: 'imperial' } };
    expect(resolveSettings(account, project, target).restoration.areaUnit).toEqual({
      value: 'ft²',
      source: 'project',
    });
    const v1 = { ...settingsProject(), version: 1 as const };
    expect(resolveSettings(account, v1).restoration.areaUnit.value).toBe('ft²');
    project.objects[0]!.surfaces[0]!.units = 'metric';
    expect(resolveSettings(account, project, target).restoration.areaUnit).toEqual({
      value: 'm²',
      source: 'surface',
    });
  });
  it('lets an explicit account or entity area unit win over the measurement system', () => {
    const account = accountSettings();
    const project = settingsProject();
    project.overrides = { restoration: { units: 'imperial' } };
    expect(resolveSettings(account, project).restoration.areaUnit.value).toBe('cm²');
    account.restoration.areaUnit = null;
    project.objects[0]!.overrides = { restoration: { areaUnit: 'in²' } };
    expect(resolveSettings(account, project, target).restoration.areaUnit).toEqual({
      value: 'in²',
      source: 'object',
    });
  });
});
