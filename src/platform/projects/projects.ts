import type { LocalVault } from '../vault/vault';
import type { Project, RestorationObject, SavedProject, Surface } from './types';

export function projectName(value: string) {
  const name = value.trim();
  if (!name || name.length > 120) throw new Error('Invalid name');
  return name;
}

export const newSurface = (name: string): Surface => ({
  id: crypto.randomUUID(),
  name: projectName(name),
  units: null,
  images: [],
});

export const newObject = (name: string, surface: string): RestorationObject => ({
  id: crypto.randomUUID(),
  name: projectName(name),
  units: null,
  surfaces: [newSurface(surface)],
});

export function newProject(
  name: string,
  object: string,
  surface: string,
  currency: string,
): SavedProject {
  return {
    id: crypto.randomUUID(),
    version: 1,
    revision: 0,
    name: projectName(name),
    archived: false,
    updatedAt: Date.now(),
    settings: { version: 1, units: 'metric', currency },
    objects: [newObject(object, surface)],
  };
}

export function validateProject(project: Project, id: string) {
  if (project.id !== id || project.version !== 1 || project.settings?.version !== 1)
    throw new Error('Unsupported project document');
  if (!project.objects.length || project.objects.some((object) => !object.surfaces.length))
    throw new Error('Incomplete project hierarchy');
  if (!/^[A-Z]{3}$/.test(project.settings.currency)) throw new Error('Invalid currency');
  return project;
}

export function localProjects(vault: LocalVault) {
  return {
    async list() {
      return (await vault.projects().list()).map(({ id, revision, text }) => ({
        ...validateProject(JSON.parse(text) as Project, id),
        revision,
      }));
    },
    async save({ revision, ...value }: SavedProject) {
      const next = validateProject({ ...value, updatedAt: Date.now() }, value.id);
      return {
        ...next,
        revision: await vault.projects().save(next.id, revision, JSON.stringify(next)),
      };
    },
  };
}
