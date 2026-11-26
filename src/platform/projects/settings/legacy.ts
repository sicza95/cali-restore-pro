import type { Project, RestorationObject, Surface } from '../types';
import type { EntityOverrides } from '../browser-contracts';

/** Feed this to an inspector so old explicit units have an enabled Override toggle. */
export function editableEntityOverrides(entity: RestorationObject | Surface): EntityOverrides {
  if (entity.units == null) return entity.overrides ?? {};
  return {
    ...entity.overrides,
    restoration: { units: entity.units, ...entity.overrides?.restoration },
  };
}

/** Persist the inspector's whole override result, retiring its legacy units atomically. */
export function applyEntityOverrides<T extends RestorationObject | Surface>(
  entity: T,
  overrides: EntityOverrides,
): T {
  return { ...entity, units: null, overrides };
}

/** Call before upgrading a v1 mutation so its saved project settings retain their meaning. */
export function preserveLegacyProjectSettings<T extends Project>(project: T): T {
  if (project.version !== 1) return project;
  return {
    ...project,
    overrides: {
      ...project.overrides,
      restoration: {
        units: project.settings.units,
        currency: project.settings.currency,
        ...project.overrides?.restoration,
      },
    },
  };
}
