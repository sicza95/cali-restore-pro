import type { Project, RestorationObject, Surface } from '../types';
import type {
  AccountSettings,
  ResolvedFields,
  ResolvedSettings,
  SettingsSource,
  SettingsTarget,
} from './types';

function root<T extends object>(values: T): ResolvedFields<T> {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, { value, source: 'account' }]),
  ) as ResolvedFields<T>;
}

function apply<T extends object>(
  fields: ResolvedFields<T>,
  values: Partial<T> | undefined,
  source: SettingsSource,
) {
  if (!values) return;
  for (const key of Object.keys(fields) as (keyof T)[]) {
    // Undefined/omitted inherits; false, empty text and null remain explicit.
    if (Object.hasOwn(values, key) && values[key] !== undefined)
      fields[key] = { value: values[key], source };
  }
}

/** Pure: reading defaults never mutates documents, geometry, estimates or reports. */
export function resolveSettings(
  account: AccountSettings,
  project: Project,
  target: SettingsTarget = {},
): ResolvedSettings {
  const result = {
    restoration: root(account.restoration),
    branding: root(account.branding),
  } as ResolvedSettings;
  apply<AccountSettings['restoration']>(
    result.restoration,
    account.organisation?.restoration,
    'organisation',
  );
  apply(result.branding, account.organisation?.branding, 'organisation');
  if (project.version === 1) apply(result.restoration, project.settings, 'project');
  apply(result.restoration, project.overrides?.restoration, 'project');
  apply(result.branding, project.overrides?.branding, 'project');
  if (target.surfaceId && !target.objectId) throw new Error('Surface settings require an object');
  if (!target.objectId) return derived();
  const object = project.objects.find(({ id }) => id === target.objectId);
  if (!object) throw new Error('Settings object not found');
  child(object, 'object');
  if (target.surfaceId) {
    const surface = object.surfaces.find(({ id }) => id === target.surfaceId);
    if (!surface) throw new Error('Settings surface not found');
    child(surface, 'surface');
  }
  return derived();

  /** An unset account area unit follows the effective measurement system and its source. */
  function derived() {
    const { areaUnit, units } = result.restoration;
    if (areaUnit.value === null)
      result.restoration.areaUnit = {
        value: units.value === 'imperial' ? 'ft²' : 'm²',
        source: units.source,
      };
    return result;
  }

  function child(entity: RestorationObject | Surface, source: 'object' | 'surface') {
    if (entity.units !== null) apply(result.restoration, { units: entity.units }, source);
    const { currency: projectCurrency } = result.restoration;
    apply(result.restoration, entity.overrides?.restoration, source);
    // Ignore malformed child currency even if an unvalidated caller supplies one.
    result.restoration.currency = projectCurrency;
    apply(result.branding, entity.overrides?.branding, source);
  }
}
