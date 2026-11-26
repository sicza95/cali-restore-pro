import { expect, it, vi } from 'vitest';
import { accountSettings, settingsProject } from '../projects/settings/test-fixtures';
import { reportDefaults, resolveReportBranding } from './settings';
import { resolveReportSurfaceUnits } from './surface-settings';
import type { PreviewSurface, ReportSettings } from './types';

it('resolves branding from the explicit report target, with project-wide using the project', async () => {
  const project = settingsProject();
  project.overrides = { branding: { studio: 'Project' } };
  project.objects[0]!.overrides = { branding: { studio: 'Object' } };
  project.objects[0]!.surfaces[0]!.overrides = { branding: { studio: 'Surface', logo: null } };
  const settings = { brandingSource: 'defaults' } as const;
  expect((await resolveReportBranding(accountSettings(), project, settings))?.studio).toBe(
    'Project',
  );
  expect(
    (await resolveReportBranding(accountSettings(), project, settings, { objectId: 'object' }))
      ?.studio,
  ).toBe('Object');
  expect(
    await resolveReportBranding(accountSettings(), project, settings, {
      objectId: 'object',
      surfaceId: 'surface',
    }),
  ).toMatchObject({ studio: 'Surface', logo: '' });
  expect(reportDefaults(accountSettings(), project).restoration.reportLanguage.value).toBe('en');
});

it('loads only project branding assets and never silently drops an unavailable logo', async () => {
  const project = settingsProject();
  project.overrides = { branding: { logo: { assetId: 'logo' } } };
  const load = vi.fn(async () => 'data:image/png;base64,BBBB');
  await expect(
    resolveReportBranding(accountSettings(), project, { brandingSource: 'defaults' }, {}, load),
  ).rejects.toThrow();
  expect(load).not.toHaveBeenCalled();
  project.assets = [{ id: 'logo', purpose: 'branding' }];
  expect(
    (
      await resolveReportBranding(
        accountSettings(),
        project,
        { brandingSource: 'defaults' },
        {},
        load,
      )
    )?.logo,
  ).toBe('data:image/png;base64,BBBB');
  expect(load).toHaveBeenCalledWith('logo');
});

it('honours omission and report overrides, and keeps issued branding frozen', async () => {
  const account = accountSettings();
  const project = settingsProject();
  const branding = { studio: '', contact: '', footer: '', accent: '#abcdef', logo: '' };
  expect(await resolveReportBranding(account, project, { brandingSource: 'omit' })).toBeUndefined();
  expect(
    await resolveReportBranding(account, project, { brandingSource: 'override', branding }),
  ).toEqual(branding);
  project.overrides = { branding: { studio: 'Changed after issuance' } };
  const saved = { brandingSource: 'defaults', branding } as const;
  expect(await resolveReportBranding(account, project, saved, {}, undefined, true)).toEqual(
    branding,
  );
  expect(saved.branding).toEqual(branding);
  expect(
    await resolveReportBranding(
      account,
      project,
      { brandingSource: 'defaults' },
      {},
      undefined,
      true,
    ),
  ).toBeUndefined();
});

it('resolves per-surface area units without changing saved work or explicit report units', () => {
  const project = settingsProject();
  project.objects[0]!.surfaces[0]!.overrides = { restoration: { areaUnit: 'in²' } };
  const surfaces: PreviewSurface[] = [
    {
      id: 'surface',
      name: 'Surface',
      object: 'Object',
      version: 'current',
      compare: '',
      unit: 'm²',
      references: [],
    },
  ];
  expect(
    resolveReportSurfaceUnits(
      accountSettings(),
      project,
      { unit: 'inherited' } as ReportSettings,
      surfaces,
    )[0]!.unit,
  ).toBe('in²');
  expect(surfaces[0]!.unit).toBe('m²');
  expect(
    resolveReportSurfaceUnits(
      accountSettings(),
      project,
      { unit: 'cm²' } as ReportSettings,
      surfaces,
    ),
  ).toBe(surfaces);
});
