import { describe, expect, it } from 'vitest';
import { newObject, newProject } from '../../../platform/projects/projects';
import { resolveSettings } from '../../../platform/projects/settings';
import { accountSettings } from '../../../platform/projects/settings/test-fixtures';
import type { SavedProject } from '../../../platform/projects/types';
import { withOverrides } from './overrides';

function legacy(): SavedProject {
  const project = newProject('Chapel', null, null, 'EUR');
  const object = newObject('North wall', 'Upper plaster');
  return {
    ...project,
    version: 1,
    revision: 3,
    settings: { version: 1, units: 'imperial', currency: 'EUR' },
    objects: [{ ...object, units: 'metric' }],
  };
}

describe('withOverrides', () => {
  it('keeps a v1 project’s saved units and currency when it is first upgraded', () => {
    const project = legacy();
    const next = withOverrides(
      project,
      { kind: 'project' },
      { restoration: { units: 'imperial', currency: 'EUR', snap: false } },
      accountSettings(),
      500,
    );
    expect(next.version).toBe(2);
    expect(next.revision).toBe(3);
    expect(next.updatedAt).toBe(500);
    const effective = resolveSettings(accountSettings(), next).restoration;
    expect(effective.currency).toEqual({ value: 'EUR', source: 'project' });
    expect(effective.snap).toEqual({ value: false, source: 'project' });
    expect(next.settings).toEqual({ version: 1, units: 'imperial', currency: 'EUR' });
  });

  it('mirrors the effective project values into settings when an override is reset', () => {
    const next = withOverrides(legacy(), { kind: 'project' }, {}, accountSettings());
    expect(next.overrides).toBeUndefined();
    expect(next.settings).toEqual({ version: 1, units: 'metric', currency: 'HUF' });
  });

  it('mirrors a child units override into the legacy field and rejects child currency', () => {
    const project = legacy();
    const objectId = project.objects[0]!.id;
    const surfaceId = project.objects[0]!.surfaces[0]!.id;
    const next = withOverrides(
      project,
      { kind: 'surface', objectId, surfaceId },
      { restoration: { units: 'imperial' }, branding: { studio: '' } },
      accountSettings(),
      700,
    );
    const surface = next.objects[0]!.surfaces[0]!;
    expect(surface.units).toBe('imperial');
    expect(surface.overrides).toEqual({
      restoration: { units: 'imperial' },
      branding: { studio: '' },
    });
    expect(surface.updatedAt).toBe(700);
    expect(next.objects[0]!.updatedAt).toBe(700);
    const reset = withOverrides(next, { kind: 'object', objectId }, {}, accountSettings());
    expect(reset.objects[0]!.units).toBeNull();
    expect(reset.objects[0]!.overrides).toBeUndefined();
    expect(() =>
      withOverrides(
        project,
        { kind: 'object', objectId },
        { restoration: { currency: 'USD' } } as never,
        accountSettings(),
      ),
    ).toThrow();
    expect(project.version).toBe(1);
  });
});
