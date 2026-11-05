import type { SavedProject, Units } from './types';

export function projectSnapshot(project: SavedProject) {
  return {
    name: project.name,
    revision: project.revision,
    objects: project.objects.map((object) => ({
      name: object.name,
      surfaces: object.surfaces.map((surface) => ({
        name: surface.name,
        units: surface.units ?? object.units ?? project.settings.units,
      })),
    })),
  };
}

export type SharedProject = ReturnType<typeof projectSnapshot>;

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid record');
  return value as Record<string, unknown>;
}

function name(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Invalid name');
  return value;
}

function units(value: unknown): Units {
  if (value !== 'metric' && value !== 'imperial') throw new Error('Invalid units');
  return value;
}

export function parseSharedProject(text: string): SharedProject {
  const project = record(JSON.parse(text));
  const { revision, objects } = project;
  if (
    typeof revision !== 'number' ||
    !Number.isSafeInteger(revision) ||
    revision < 1 ||
    !Array.isArray(objects) ||
    !objects.length
  )
    throw new Error('Invalid project snapshot');
  return {
    name: name(project.name),
    revision,
    objects: objects.map((value: unknown) => {
      const object = record(value);
      if (!Array.isArray(object.surfaces) || !object.surfaces.length)
        throw new Error('Invalid object');
      return {
        name: name(object.name),
        surfaces: object.surfaces.map((value: unknown) => {
          const surface = record(value);
          return { name: name(surface.name), units: units(surface.units) };
        }),
      };
    }),
  };
}
