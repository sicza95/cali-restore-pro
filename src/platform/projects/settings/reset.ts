import type {
  EntityOverrides,
  ProjectOverrides,
  ReportBranding,
  RestorationDefaults,
} from '../browser-contracts';
import type { RestorationObject, Surface } from '../types';

/** Remove an override rather than storing an inherited value. Preserves other groups. */
export function resetOverride<T extends ProjectOverrides | EntityOverrides>(
  overrides: T,
  group: 'restoration',
  field: keyof RestorationDefaults,
): T;
export function resetOverride<T extends ProjectOverrides | EntityOverrides>(
  overrides: T,
  group: 'branding',
  field: keyof ReportBranding,
): T;
export function resetOverride<T extends ProjectOverrides | EntityOverrides>(
  overrides: T,
  group: 'restoration' | 'branding',
  field: string,
): T {
  const next = { ...overrides };
  const fields = { ...next[group] };
  Reflect.deleteProperty(fields, field);
  if (Object.keys(fields).length) next[group] = fields;
  else delete next[group];
  return next;
}

/** Legacy child units must also be cleared, or resetting a units override resurrects them. */
export function resetLegacyUnits<T extends RestorationObject | Surface>(entity: T): T {
  return {
    ...entity,
    units: null,
    overrides: resetOverride(entity.overrides ?? {}, 'restoration', 'units'),
  };
}
