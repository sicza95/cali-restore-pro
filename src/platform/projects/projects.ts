import { assertCheckpoints } from './assessment-checkpoints';
import { assertPlanarState } from './planar-state';
import { assertDrawing } from './drawing-state';
import type { JournalWrite, PendingAttachment } from '../vault/project-store';
import type { LocalVault } from '../vault/vault';
import type { EntityMetadata } from './browser-contracts';
import type {
  Project,
  ProjectV2,
  RestorationObjectV2,
  SavedProject,
  SavedProjectV2,
  SurfaceV2,
} from './types';

const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const unit = (value: unknown) => value === 'metric' || value === 'imperial';
const timestamp = (value: unknown) =>
  value === null || (Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= 8.64e15);
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid project record');
  return value as Record<string, unknown>;
};
const only = (value: Record<string, unknown>, keys: string[]) => {
  if (Object.keys(value).some((key) => !keys.includes(key)))
    throw new Error('Invalid project field');
};
const metadata = (createdBy: string | null): EntityMetadata => ({
  createdAt: Date.now(),
  updatedAt: Date.now(),
  createdBy,
});

function assertMetadata(value: Record<string, unknown>) {
  if (
    !timestamp(value.createdAt) ||
    !timestamp(value.updatedAt) ||
    (value.createdBy !== null &&
      (typeof value.createdBy !== 'string' || !uuid.test(value.createdBy)))
  )
    throw new Error('Invalid entity metadata');
}

function assertReference(value: unknown, ids: ReadonlySet<string>) {
  const ref = record(value);
  only(ref, ['assetId']);
  if (typeof ref.assetId !== 'string' || !uuid.test(ref.assetId) || !ids.has(ref.assetId))
    throw new Error('Invalid asset reference');
}

function assertOverrides(value: unknown, project: boolean, logos: ReadonlySet<string>) {
  const overrides = record(value);
  only(overrides, ['restoration', 'branding']);
  if (overrides.restoration !== undefined) {
    const defaults = record(overrides.restoration);
    only(defaults, [
      'units',
      'areaUnit',
      'reportLanguage',
      'snap',
      ...(project ? ['currency'] : []),
    ]);
    if (
      (defaults.units !== undefined && !unit(defaults.units)) ||
      (defaults.areaUnit !== undefined &&
        (typeof defaults.areaUnit !== 'string' ||
          !['m²', 'cm²', 'ft²', 'in²'].includes(defaults.areaUnit))) ||
      (defaults.reportLanguage !== undefined &&
        (typeof defaults.reportLanguage !== 'string' ||
          !['en', 'hu'].includes(defaults.reportLanguage))) ||
      (defaults.snap !== undefined && typeof defaults.snap !== 'boolean') ||
      (defaults.currency !== undefined &&
        (typeof defaults.currency !== 'string' || !/^[A-Z]{3}$/.test(defaults.currency)))
    )
      throw new Error('Invalid restoration override');
  }
  if (overrides.branding !== undefined) {
    const brand = record(overrides.branding);
    only(brand, ['studio', 'contact', 'footer', 'accent', 'logo']);
    for (const key of ['studio', 'contact', 'footer']) {
      if (brand[key] !== undefined && (typeof brand[key] !== 'string' || brand[key].length > 4000))
        throw new Error('Invalid branding text');
    }
    if (
      brand.accent !== undefined &&
      (typeof brand.accent !== 'string' || !/^#[a-f0-9]{6}$/i.test(brand.accent))
    )
      throw new Error('Invalid branding colour');
    if (brand.logo !== undefined && brand.logo !== null) assertReference(brand.logo, logos);
  }
}

function assertEntity(
  value: Record<string, unknown>,
  covers: ReadonlySet<string>,
  logos: ReadonlySet<string>,
  project = false,
) {
  assertMetadata(value);
  if (value.cover !== undefined) assertReference(value.cover, covers);
  if (value.overrides !== undefined) assertOverrides(value.overrides, project, logos);
}

export function projectName(value: string) {
  const name = value.trim();
  if (!name || name.length > 120) throw new Error('Invalid name');
  return name;
}

export const newSurface = (name: string, createdBy: string | null = null): SurfaceV2 => ({
  ...metadata(createdBy),
  id: crypto.randomUUID(),
  name: projectName(name),
  units: null,
  images: [],
});

export const newObject = (
  name: string,
  surface?: string,
  createdBy: string | null = null,
): RestorationObjectV2 => ({
  ...metadata(createdBy),
  id: crypto.randomUUID(),
  name: projectName(name),
  units: null,
  surfaces: surface === undefined ? [] : [newSurface(surface, createdBy)],
});

export function newProject(
  name: string,
  object: string | null,
  surface: string | null,
  currency: string,
  organisation?: string,
  createdBy: string | null = null,
): SavedProjectV2 {
  return {
    ...metadata(createdBy),
    id: crypto.randomUUID(),
    version: 2,
    revision: 0,
    name: projectName(name),
    archived: false,
    ...(organisation ? { organisation } : {}),
    updatedAt: Date.now(),
    settings: { version: 1, units: 'metric', currency },
    // v2 resolves settings from overrides, so the chosen currency must be an explicit override.
    overrides: { restoration: { currency } },
    objects: object === null ? [] : [newObject(object, surface ?? undefined, createdBy)],
  };
}

/** Validates without upgrading or mutating: reading a v1 document never writes v2. */
export function validateProject(value: unknown, id: string): Project {
  const input = record(value);
  if (
    input.id !== id ||
    (input.version !== 1 && input.version !== 2) ||
    record(input.settings).version !== 1
  )
    throw new Error('Unsupported project document');
  const project = input as Project;
  if (!Array.isArray(project.objects)) throw new Error('Invalid project hierarchy');
  if (
    project.version === 1 &&
    (!project.objects.length || project.objects.some((object) => !object.surfaces?.length))
  )
    throw new Error('Incomplete project hierarchy');
  if (!/^[A-Z]{3}$/.test(project.settings.currency)) throw new Error('Invalid currency');
  if (
    project.organisation !== undefined &&
    (typeof project.organisation !== 'string' || !uuid.test(project.organisation))
  )
    throw new Error('Invalid organisation');
  const covers = new Set<string>();
  const logos = new Set<string>();
  if (project.version === 2) {
    if (project.assets !== undefined && !Array.isArray(project.assets))
      throw new Error('Invalid project assets');
    for (const value of project.assets ?? []) {
      const asset = record(value);
      only(asset, ['id', 'purpose']);
      if (
        typeof asset.id !== 'string' ||
        !uuid.test(asset.id) ||
        (asset.purpose !== 'cover' && asset.purpose !== 'branding') ||
        covers.has(asset.id) ||
        logos.has(asset.id)
      )
        throw new Error('Invalid project asset');
      (asset.purpose === 'cover' ? covers : logos).add(asset.id);
    }
  }
  const projectCovers = new Set(covers);
  const entityIds = new Set([id]);
  for (const object of project.objects) {
    const objectValue = record(object);
    if (!Array.isArray(object.surfaces)) throw new Error('Invalid object surfaces');
    const objectCovers = new Set(covers);
    for (const surface of object.surfaces) {
      const surfaceValue = record(surface);
      if (!Array.isArray(surface.images)) throw new Error('Invalid surface images');
      if (project.version === 2) {
        assertNode(surfaceValue, entityIds);
        const surfaceCovers = new Set(covers);
        for (const image of surface.images) {
          const attachment = record(image);
          if (
            typeof attachment.id !== 'string' ||
            !uuid.test(attachment.id) ||
            (attachment.role !== 'mapping' && attachment.role !== 'reference')
          )
            throw new Error('Invalid image attachment');
          surfaceCovers.add(attachment.id);
          objectCovers.add(attachment.id);
          projectCovers.add(attachment.id);
        }
        assertEntity(surfaceValue, surfaceCovers, logos);
      }
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
    if (project.version === 2) {
      assertNode(objectValue, entityIds);
      assertEntity(objectValue, objectCovers, logos);
    }
  }
  if (project.version === 2) {
    assertNode(input);
    if (
      !unit(project.settings.units) ||
      typeof project.archived !== 'boolean' ||
      project.updatedAt === null
    )
      throw new Error('Invalid project settings');
    assertEntity(input, projectCovers, logos, true);
  }
  return project;
}

function assertNode(value: Record<string, unknown>, ids?: Set<string>) {
  if (
    (value.archived !== undefined && typeof value.archived !== 'boolean') ||
    typeof value.id !== 'string' ||
    !uuid.test(value.id) ||
    ids?.has(value.id) ||
    typeof value.name !== 'string' ||
    value.name !== projectName(value.name) ||
    (ids !== undefined && value.units !== null && !unit(value.units))
  )
    throw new Error('Invalid project entity');
  ids?.add(value.id);
}

/** Pure, lossless upgrade; unknown historical metadata remains null. */
export function upgradeProject(project: Project): ProjectV2 {
  if (project.version !== 1 && project.version !== 2)
    throw new Error('Unsupported project document');
  // A v1 mutation may have just removed the last child. Validate its upgraded
  // shape, while reads still enforce the historical v1 hierarchy contract.
  if (project.version === 2) validateProject(project, project.id);
  const historic = (entity: Partial<EntityMetadata>): EntityMetadata => ({
    createdAt: entity.createdAt ?? null,
    updatedAt: entity.updatedAt ?? null,
    createdBy: entity.createdBy ?? null,
  });
  const next: ProjectV2 = {
    ...project,
    ...historic(project),
    version: 2,
    updatedAt: project.updatedAt,
    objects: project.objects.map((object) => ({
      ...object,
      ...historic(object),
      surfaces: object.surfaces.map((surface) => ({ ...surface, ...historic(surface) })),
    })),
  };
  validateProject(next, next.id);
  return next;
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
      journal?: JournalWrite | JournalWrite[],
    ) {
      const next = upgradeProject({ ...value, updatedAt: Date.now() });
      if (
        attachment &&
        !next.objects.some((object) =>
          object.surfaces.some((surface) =>
            surface.images.some((image) => image.id === attachment.id),
          ),
        ) &&
        !next.assets?.some((asset) => asset.id === attachment.id)
      )
        throw new Error('Missing image attachment');
      return {
        ...next,
        revision: await vault
          .projects()
          .save(next.id, revision, JSON.stringify(next), attachment, journal),
      };
    },
    /** Permanent: only for a project that was never hosted (hosted ones use the trash). */
    remove(project: SavedProject) {
      return vault.projects().remove(project.id, project.revision);
    },
  };
}
