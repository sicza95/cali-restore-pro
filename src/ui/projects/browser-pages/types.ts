import type { BrowserTarget } from '../../../platform/projects/browser/mutations';
import type { RestorationObject, SavedProject, Surface } from '../../../platform/projects/types';
import type { JournalWrite, PendingAttachment } from '../../../platform/vault/project-store';
import type { LocalVault } from '../../../platform/vault/vault';
import type { Language } from '../../account-access/types';
import type { useEditorSync } from '../useEditorSync';

/** What the project workspace lends every browser level: data, saving and navigation. */
export type Workspace = {
  vault: LocalVault;
  language: Language;
  busy: () => boolean;
  run: (task: () => Promise<void>) => Promise<boolean>;
  save: (
    project: SavedProject,
    attachment?: PendingAttachment,
    journal?: JournalWrite | JournalWrite[],
  ) => Promise<void>;
  /** Puts an already saved project into the list (mutations save it themselves). */
  update: (project: SavedProject) => void;
  /** Removes a never-hosted project from this device for good. */
  remove: (project: SavedProject) => Promise<void>;
  sync: ReturnType<typeof useEditorSync>;
  navigate: (href: string) => void;
  projects: () => readonly SavedProject[];
  openSettings: (project: string) => void;
};

/** A local item the inspector can edit, resolved again from the latest saved project. */
export type InspectedEntity = {
  project: SavedProject;
  target: BrowserTarget;
  entity: SavedProject | RestorationObject | Surface;
};

export function entityOf(
  project: SavedProject,
  target: BrowserTarget,
): InspectedEntity | undefined {
  if (target.kind === 'project') return { project, target, entity: project };
  const object = project.objects.find(({ id }) => id === target.objectId);
  if (!object) return undefined;
  if (target.kind === 'object') return { project, target, entity: object };
  const surface = object.surfaces.find(({ id }) => id === target.surfaceId);
  return surface && { project, target, entity: surface };
}
