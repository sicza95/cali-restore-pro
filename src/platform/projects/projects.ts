import { assertCheckpoints } from './assessment-checkpoints';
import { assertPlanarState } from './planar-state';
import { assertDrawing } from './drawing-state';
import type { JournalWrite, PendingAttachment } from '../vault/project-store';
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
  for (const object of project.objects) {
    for (const surface of object.surfaces) {
      const assessments = surface.assessments ?? [];
      if (
        !Array.isArray(assessments) ||
        assessments.length > 128 ||
        new Set(assessments.map((entry) => entry.source.id)).size !== assessments.length
      )
        throw new Error('Invalid surface assessments');
      const attachments = new Set(surface.images.map((image) => image.id));
      if (surface.checkpoints !== undefined) assertCheckpoints(surface.checkpoints, attachments);
      for (const entry of assessments) {
        assertPlanarState(entry);
        if (entry.drawing !== undefined) assertDrawing(entry.drawing);
        if (
          ![
            entry.source,
            ...entry.details.map((item) => item.source),
            ...entry.alignments.map((item) => item.source),
          ].every((source) => attachments.has(source.id))
        )
          throw new Error('Assessment photo is not attached');
      }
    }
  }
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
    async save(
      { revision, ...value }: SavedProject,
      attachment?: PendingAttachment,
      journal?: JournalWrite,
    ) {
      const next = validateProject({ ...value, updatedAt: Date.now() }, value.id);
      if (
        attachment &&
        !next.objects.some((object) =>
          object.surfaces.some((surface) =>
            surface.images.some((image) => image.id === attachment.id),
          ),
        )
      )
        throw new Error('Missing image attachment');
      return {
        ...next,
        revision: await vault
          .projects()
          .save(next.id, revision, JSON.stringify(next), attachment, journal),
      };
    },
  };
}
