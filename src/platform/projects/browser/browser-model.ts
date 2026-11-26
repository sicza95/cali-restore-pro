import type {
  BrowserItemDescriptor,
  BrowserOwner,
  BrowserItemStatus,
  ProjectVisibility,
  BrowserOriginalAvailability,
} from '../browser-contracts';
import type { Project, RestorationObject, Surface } from '../types';
import { evaluateQuery } from './query';
import type { QueryAst } from './query';

export type ProjectBrowserContext = {
  owners?: BrowserOwner[];
  visibility?: ProjectVisibility;
  status?: BrowserItemStatus;
  originals?: BrowserOriginalAvailability;
  access?: 'editable' | 'read-only';
};
export type RemoteBrowserProject = {
  id: string;
  name: string;
  organisation: string;
  unreadable?: boolean;
  document?: Project;
} & ProjectBrowserContext;
export type DirectoryBrowserProject = { id: string; name: string; owners: BrowserOwner[] };
export type ProjectBrowserInput = {
  organisation: string | null;
  local: readonly Project[];
  remote?: readonly RemoteBrowserProject[];
  /** Only cards from the requested organisation's directory page(s). */
  directory?: readonly DirectoryBrowserProject[];
  context?: Readonly<Record<string, ProjectBrowserContext>>;
};

function descriptor(
  project: Project,
  entity: Project | RestorationObject | Surface,
  kind: BrowserItemDescriptor['kind'],
  childCount: number,
  context: ProjectBrowserContext,
  objectId?: string,
): BrowserItemDescriptor {
  return {
    id: entity.id,
    kind,
    projectId: project.id,
    ...(objectId === undefined ? {} : { objectId }),
    name: entity.name,
    organisation: project.organisation ?? null,
    createdAt: entity.createdAt ?? null,
    updatedAt: entity.updatedAt ?? null,
    createdBy: entity.createdBy ?? null,
    ...(entity.cover ? { cover: { ...entity.cover } } : {}),
    owners: context.owners?.map((owner) => ({ ...owner })) ?? [],
    childCount,
    status: context.status ?? 'local',
    originals: context.originals ?? 'unknown',
    visibility: context.visibility ?? 'private',
    access: context.access ?? 'editable',
  };
}

/** Local > authorised remote > directory. Directory metadata never exposes descendants. */
export function projectItems(input: ProjectBrowserInput): BrowserItemDescriptor[] {
  const found = new Map<string, BrowserItemDescriptor>();
  for (const project of input.local) {
    if ((project.organisation ?? null) !== input.organisation) continue;
    found.set(
      project.id,
      descriptor(
        project,
        project,
        'project',
        project.objects.length,
        input.context?.[project.id] ?? {},
      ),
    );
  }
  for (const remote of input.remote ?? []) {
    // Like local projects, a missing organisation (no organisations loaded) is Personal's null.
    if ((remote.organisation ?? null) !== input.organisation || found.has(remote.id)) continue;
    const context = {
      ...remote,
      ...input.context?.[remote.id],
      status: remote.unreadable ? ('error' as const) : ('remote' as const),
    };
    const item: BrowserItemDescriptor = remote.document
      ? descriptor(
          remote.document,
          remote.document,
          'project',
          remote.document.objects.length,
          context,
        )
      : {
          id: remote.id,
          kind: 'project',
          projectId: remote.id,
          name: remote.name,
          organisation: remote.organisation,
          createdAt: null,
          updatedAt: null,
          createdBy: null,
          owners: context.owners?.map((owner) => ({ ...owner })) ?? [],
          childCount: null,
          status: context.status,
          originals: 'none',
          visibility: context.visibility ?? 'private',
          access: context.access ?? 'editable',
        };
    found.set(item.id, item);
  }
  for (const card of input.directory ?? []) {
    if (found.has(card.id)) continue;
    found.set(card.id, {
      id: card.id,
      kind: 'project',
      projectId: card.id,
      name: card.name,
      organisation: input.organisation,
      owners: card.owners.map((owner) => ({ ...owner })),
      createdAt: null,
      updatedAt: null,
      createdBy: null,
      childCount: null,
      status: 'remote',
      originals: 'unknown',
      visibility: 'listed',
      access: 'directory',
    });
  }
  return [...found.values()];
}

export function objectItems(
  project: Project,
  context: ProjectBrowserContext = {},
): BrowserItemDescriptor[] {
  return project.objects.map((object) =>
    descriptor(project, object, 'object', object.surfaces.length, context, object.id),
  );
}

export function surfaceItems(
  project: Project,
  objectId: string,
  context: ProjectBrowserContext = {},
): BrowserItemDescriptor[] {
  const object = project.objects.find((object) => object.id === objectId);
  if (!object) throw new Error('Object not found');
  return object.surfaces.map((surface) =>
    descriptor(project, surface, 'surface', surface.images.length, context, objectId),
  );
}

export type BrowserSort = { field: 'name' | 'created' | 'modified'; direction: 'asc' | 'desc' };
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
export function sortItems(
  items: readonly BrowserItemDescriptor[],
  sort: BrowserSort,
): BrowserItemDescriptor[] {
  const direction = sort.direction === 'asc' ? 1 : -1;
  return [...items].sort((a, b) => {
    let result: number;
    if (sort.field === 'name') result = compare(a.name.toLowerCase(), b.name.toLowerCase());
    else {
      const field = sort.field === 'created' ? 'createdAt' : 'updatedAt';
      const left = a[field],
        right = b[field];
      if (left === null || right === null)
        return left === right ? compare(a.id, b.id) : left === null ? 1 : -1;
      result = left - right;
    }
    return result * direction || compare(a.id, b.id);
  });
}

export function filterItems(
  items: readonly BrowserItemDescriptor[],
  ast: QueryAst,
  options: {
    timeZone?: string;
    archived?: (item: BrowserItemDescriptor) => boolean | undefined;
    creatorName?: (id: string) => string | undefined;
  } = {},
): BrowserItemDescriptor[] {
  return items.filter((item) =>
    evaluateQuery(
      ast,
      {
        ...item,
        archived: options.archived?.(item),
        creatorName: item.createdBy ? options.creatorName?.(item.createdBy) : undefined,
      },
      options.timeZone,
    ),
  );
}

export function defaultSelection(
  items: readonly Pick<BrowserItemDescriptor, 'id'>[],
  selected?: string | null,
): string | null {
  return items.some(({ id }) => id === selected) ? selected! : (items[0]?.id ?? null);
}

/** Keep a surviving selection; otherwise choose the next neighbour, then the previous. */
export function selectionAfterDelete(
  before: readonly Pick<BrowserItemDescriptor, 'id'>[],
  after: readonly Pick<BrowserItemDescriptor, 'id'>[],
  selected: string | null,
): string | null {
  if (after.some(({ id }) => id === selected)) return selected;
  const index = before.findIndex(({ id }) => id === selected);
  const survivors = new Set(after.map(({ id }) => id));
  return (
    before.slice(Math.max(0, index + 1)).find(({ id }) => survivors.has(id))?.id ??
    before
      .slice(0, Math.max(0, index))
      .reverse()
      .find(({ id }) => survivors.has(id))?.id ??
    after[0]?.id ??
    null
  );
}
