import { describe, expect, it } from 'vitest';
import { newObject, newProject, newSurface } from '../projects';
import {
  defaultSelection,
  filterItems,
  objectItems,
  projectItems,
  selectionAfterDelete,
  sortItems,
  surfaceItems,
} from './browser-model';
import { parseQuery } from './query';

describe('browser projections', () => {
  it('exposes archived state at every level and supports filtering without an extra lookup', () => {
    const project = newProject('Archived', 'Object', 'Surface', 'EUR');
    project.archived = true;
    project.objects[0]!.archived = true;
    project.objects[0]!.surfaces[0]!.archived = true;
    const projects = projectItems({ organisation: null, local: [project] });
    expect(projects[0]!.archived).toBe(true);
    expect(objectItems(project)[0]!.archived).toBe(true);
    expect(surfaceItems(project, project.objects[0]!.id)[0]!.archived).toBe(true);
    expect(filterItems(projects, parseQuery('archived:true').ast!)).toHaveLength(1);
  });
  it('combines local, remote-only, unreadable and directory cards with authorised precedence', () => {
    const local = newProject('Local', null, null, 'EUR', 'org');
    const other = newProject('Other', null, null, 'EUR', 'elsewhere');
    const owners = [{ id: 'a', name: 'Anna' }];
    const items = projectItems({
      organisation: 'org',
      local: [local, other],
      remote: [
        { id: local.id, name: 'Stale remote', organisation: 'org' },
        { id: 'remote', name: 'Remote', organisation: 'org' },
        { id: 'bad', name: 'bad', organisation: 'org', unreadable: true },
      ],
      directory: [
        { id: local.id, name: 'Published', owners },
        { id: 'directory', name: 'Public', owners },
      ],
    });
    expect(items.map(({ name }) => name)).toEqual(['Local', 'Remote', 'bad', 'Public']);
    expect(items[1]).toMatchObject({ status: 'remote', createdAt: null, childCount: null });
    expect(items[2]!.status).toBe('error');
    expect(items[3]).toMatchObject({
      access: 'directory',
      status: 'remote',
      visibility: 'listed',
      childCount: null,
      createdBy: null,
    });
    expect(items[3]!.cover).toBeUndefined();
    items[3]!.owners[0]!.name = 'Changed';
    expect(owners[0]!.name).toBe('Anna');
  });
  it('lists an online-only project without an organisation when none is selected', () => {
    const items = projectItems({
      organisation: null,
      local: [],
      remote: [{ id: 'remote', name: 'Remote', organisation: undefined as unknown as string }],
    });
    expect(items.map(({ name, status }) => [name, status])).toEqual([['Remote', 'remote']]);
  });
  it('projects v1 unknown history without upgrading and children inherit document context', () => {
    const project = newProject('Project', 'Object', 'Surface', 'EUR');
    const object = project.objects[0]!;
    const legacy = {
      ...project,
      version: 1 as const,
      createdAt: undefined,
      createdBy: undefined,
      objects: [{ ...object, createdAt: undefined, updatedAt: undefined, createdBy: undefined }],
    };
    const context = {
      owners: [{ id: 'a', name: 'Anna' }],
      status: 'conflict' as const,
      visibility: 'listed' as const,
    };
    expect(objectItems(legacy, context)[0]).toMatchObject({
      createdAt: null,
      updatedAt: null,
      createdBy: null,
      status: 'conflict',
      visibility: 'listed',
      owners: context.owners,
      objectId: object.id,
    });
    expect(surfaceItems(project, object.id, context)[0]).toMatchObject({
      status: 'conflict',
      projectId: project.id,
    });
    expect(legacy.version).toBe(1);
    expect(() => surfaceItems(project, 'missing')).toThrow('Object not found');
    expect(objectItems(newProject('Empty', null, null, 'EUR'))).toEqual([]);
  });
  it('sorts both directions with unknown dates last and stable ascending ID ties', () => {
    const project = newProject('P', null, null, 'EUR');
    project.objects = [
      newObject('Beta'),
      newObject('alpha'),
      newObject('Alpha'),
      newObject('Unknown'),
    ];
    const items = objectItems(project).map((row, i) => ({
      ...row,
      id: ['c', 'b', 'a', 'd'][i]!,
      createdAt: [2, 1, 1, null][i]!,
      updatedAt: [null, 2, 3, 1][i]!,
    }));
    expect(sortItems(items, { field: 'name', direction: 'asc' }).map(({ id }) => id)).toEqual([
      'a',
      'b',
      'c',
      'd',
    ]);
    expect(sortItems(items, { field: 'name', direction: 'desc' }).map(({ id }) => id)).toEqual([
      'd',
      'c',
      'a',
      'b',
    ]);
    expect(sortItems(items, { field: 'created', direction: 'desc' }).map(({ id }) => id)).toEqual([
      'c',
      'a',
      'b',
      'd',
    ]);
    expect(sortItems(items, { field: 'created', direction: 'asc' }).map(({ id }) => id)).toEqual([
      'a',
      'b',
      'c',
      'd',
    ]);
    expect(sortItems(items, { field: 'modified', direction: 'desc' }).map(({ id }) => id)).toEqual([
      'a',
      'b',
      'd',
      'c',
    ]);
    expect(items[0]!.id).toBe('c');
  });
  it('filters only supplied current-level items, resolving creator and archive metadata explicitly', () => {
    const project = newProject('Project', 'Object', 'Surface', 'EUR');
    project.objects[0]!.createdBy = 'account';
    const items = objectItems(project, { owners: [{ id: 'owner', name: 'Csaba' }] });
    const query = parseQuery('owner:csaba creator:anna archived:false');
    expect(
      filterItems(items, query.ast!, { creatorName: () => 'Anna', archived: () => false }),
    ).toEqual(items);
    expect(filterItems(items, query.ast!)).toEqual([]);
    expect(surfaceItems(project, project.objects[0]!.id)).toHaveLength(1);
    project.objects[0]!.surfaces.push(newSurface('Second'));
    expect(objectItems(project)[0]!.childCount).toBe(2);
  });
});

it('selects the first by default and a surviving neighbour after deletion', () => {
  const before = ['a', 'b', 'c', 'd'].map((id) => ({ id }));
  expect(defaultSelection(before)).toBe('a');
  expect(defaultSelection(before, 'b')).toBe('b');
  expect(defaultSelection([], 'b')).toBeNull();
  expect(
    selectionAfterDelete(
      before,
      before.filter(({ id }) => id !== 'b'),
      'b',
    ),
  ).toBe('c');
  expect(selectionAfterDelete(before, before.slice(0, 3), 'd')).toBe('c');
  expect(selectionAfterDelete(before, [{ id: 'b' }], 'b')).toBe('b');
  expect(selectionAfterDelete(before, [], 'd')).toBeNull();
});
