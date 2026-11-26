import { afterEach, expect, expectTypeOf, it, vi } from 'vitest';
import type { ProjectBrowserError, ProjectVisibility as ApiVisibility } from '../api';
import type { LocalVault } from '../vault/vault';
import { browserItemStatuses, projectVisibilities } from './browser-contracts';
import type { ProjectVisibility } from './browser-contracts';
import {
  localProjects,
  newObject,
  newProject,
  newSurface,
  upgradeProject,
  validateProject,
} from './projects';
import type { Project, SavedProject } from './types';

const projectId = '00000000-0000-4000-8000-000000000001';
const objectId = '00000000-0000-4000-8000-000000000002';
const surfaceId = '00000000-0000-4000-8000-000000000003';
const imageId = '00000000-0000-4000-8000-000000000004';
const author = '00000000-0000-4000-8000-000000000005';
const coverId = '00000000-0000-4000-8000-000000000006';
const logoId = '00000000-0000-4000-8000-000000000007';
const legacy = (): Project => ({
  version: 1,
  id: projectId,
  name: 'North chapel',
  archived: false,
  updatedAt: 1234,
  settings: { version: 1, units: 'metric', currency: 'HUF' },
  objects: [
    {
      id: objectId,
      name: 'Wall',
      units: null,
      surfaces: [{ id: surfaceId, name: 'Plaster', units: null, images: [] }],
    },
  ],
});
const check = (value: unknown) => validateProject(value, projectId);

afterEach(() => vi.restoreAllMocks());

it('reads a v1 document as-is without inventing metadata or altering its version', () => {
  const project = legacy();
  const original = JSON.stringify(project);
  expect(check(project)).toBe(project);
  expect(JSON.stringify(project)).toBe(original);
  expect(project.createdAt).toBeUndefined();
});

it('upgrades losslessly with null historical metadata and the known project modified time', () => {
  const project = legacy();
  project.organisation = author;
  project.objects[0]!.units = 'imperial';
  project.objects[0]!.surfaces[0]!.images = [{ id: imageId, role: 'reference' }];
  const before = structuredClone(project);
  const next = upgradeProject(project);
  expect(project).toEqual(before);
  expect(next).toMatchObject({ version: 2, createdAt: null, createdBy: null, updatedAt: 1234 });
  expect(next.objects[0]).toMatchObject({
    createdAt: null,
    createdBy: null,
    updatedAt: null,
    units: 'imperial',
  });
  expect(next.objects[0]!.surfaces[0]).toMatchObject({
    createdAt: null,
    createdBy: null,
    updatedAt: null,
  });
  expect(next.objects[0]!.surfaces[0]!.images).toEqual(before.objects[0]!.surfaces[0]!.images);
  expect(next.organisation).toBe(author);
  expect(upgradeProject(next)).toEqual(next);
});

it('stamps new entities and preserves existing seeded-constructor call signatures', () => {
  vi.spyOn(Date, 'now').mockReturnValue(9876);
  const next = newProject(' Chapel ', 'Wall', 'Plaster', 'EUR', author, author);
  expect(next).toMatchObject({
    version: 2,
    name: 'Chapel',
    revision: 0,
    createdBy: author,
    createdAt: 9876,
    updatedAt: 9876,
  });
  expect(next.objects[0]!.surfaces[0]).toMatchObject({
    name: 'Plaster',
    createdAt: 9876,
    createdBy: author,
  });
  expect(validateProject(next, next.id)).toBe(next);
  expect(newSurface('Other').createdBy).toBeNull();
});

it('permits empty v2 projects and objects without seeding placeholder children', () => {
  const empty = newProject('Empty', null, null, 'EUR');
  expect(empty.objects).toEqual([]);
  expect(validateProject(empty, empty.id)).toBe(empty);
  empty.objects.push(newObject('Empty object'));
  expect(empty.objects[0]!.surfaces).toEqual([]);
  expect(validateProject(empty, empty.id)).toBe(empty);
  expect(newProject('One object', 'Empty object', null, 'EUR').objects[0]!.surfaces).toEqual([]);
});

it('continues rejecting incomplete v1 documents on reads, but upgrades an empty mutation', () => {
  const project = legacy();
  project.objects = [];
  expect(() => check(project)).toThrow('Incomplete project hierarchy');
  expect(upgradeProject(project)).toMatchObject({ version: 2, objects: [] });
  const withEmptyObject = legacy();
  withEmptyObject.objects[0]!.surfaces = [];
  expect(() => check(withEmptyObject)).toThrow('Incomplete project hierarchy');
  expect(upgradeProject(withEmptyObject).objects[0]!.surfaces).toEqual([]);
});

it('resolves covers only from the entity subtree or registered dedicated cover files', () => {
  const project = upgradeProject(legacy());
  project.objects[0]!.surfaces[0]!.images.push({ id: imageId, role: 'mapping' });
  project.cover = { assetId: imageId };
  project.objects[0]!.cover = { assetId: imageId };
  project.objects[0]!.surfaces[0]!.cover = { assetId: imageId };
  expect(check(project)).toBe(project);
  project.assets = [{ id: coverId, purpose: 'cover' }];
  project.objects[0]!.cover = { assetId: coverId };
  expect(check(project)).toBe(project);
  const sibling = newSurface('Sibling');
  sibling.cover = { assetId: imageId };
  project.objects[0]!.surfaces.push(sibling);
  expect(() => check(project)).toThrow('Invalid asset reference');
});

it('supports inherited, explicit false, cleared text, and cleared logo overrides', () => {
  const project = upgradeProject(legacy());
  project.assets = [{ id: logoId, purpose: 'branding' }];
  project.overrides = {
    restoration: {
      units: 'imperial',
      areaUnit: 'in²',
      currency: 'EUR',
      reportLanguage: 'hu',
      snap: false,
    },
    branding: { studio: '', contact: '', footer: '', accent: '#1122Aa', logo: { assetId: logoId } },
  };
  project.objects[0]!.overrides = { branding: { logo: null }, restoration: {} };
  expect(check(project)).toBe(project);
});

it.each([
  { restoration: { currency: 'EUR' } },
  { restoration: { snap: 'false' } },
  { restoration: { areaUnit: 'km²' } },
  { restoration: { areaUnit: ['m²'] } },
  { restoration: { reportLanguage: 'de' } },
  { restoration: { reportLanguage: ['en'] } },
  { branding: { accent: 'red' } },
  { branding: { logo: 'data:image/png;base64,AAAA' } },
  { branding: { logo: { assetId: logoId } } },
  { branding: { extra: true } },
  { restoration: null },
])('rejects invalid or project-only child overrides: %j', (overrides) => {
  const project = upgradeProject(legacy());
  const raw = { ...project, objects: [{ ...project.objects[0]!, overrides }] };
  expect(() => check(raw)).toThrow();
});

it.each([
  { createdAt: undefined },
  { createdAt: -1 },
  { createdAt: Infinity },
  { updatedAt: null },
  { createdBy: 'somebody' },
  { cover: { assetId: 'https://example.test/cover.png' } },
  { cover: { assetId: coverId, bytes: 'AAAA' } },
  { version: 3 },
  { settings: { version: 2, currency: 'EUR', units: 'metric' } },
])('rejects invalid v2 document metadata/references: %j', (patch) => {
  expect(() => check({ ...upgradeProject(legacy()), ...patch })).toThrow();
});

it('rejects missing child metadata, duplicate entities/assets and malformed collections', () => {
  const project = upgradeProject(legacy());
  expect(() => check({ ...project, objects: legacy().objects })).toThrow('Invalid entity metadata');
  expect(() => check({ ...project, objects: [...project.objects, ...project.objects] })).toThrow();
  expect(() => check({ ...project, objects: null })).toThrow();
  expect(() => check({ ...project, assets: null })).toThrow();
  expect(() => check({ ...project, organisation: [author] })).toThrow();
  expect(() =>
    check({ ...project, objects: [{ ...project.objects[0]!, units: undefined }] }),
  ).toThrow();
  expect(() =>
    check({
      ...project,
      assets: [
        { id: coverId, purpose: 'cover' },
        { id: coverId, purpose: 'branding' },
      ],
    }),
  ).toThrow();
  expect(() => check({ ...project, assets: [{ id: coverId, purpose: 'arbitrary' }] })).toThrow();
});

it('retains assessment and checkpoint guards on v2 documents', () => {
  const project = upgradeProject(legacy());
  project.objects[0]!.surfaces[0]!.assessments = [];
  expect(check(project)).toBe(project);
  project.objects[0]!.surfaces[0]!.assessments = [{} as never];
  expect(() => check(project)).toThrow();
  project.objects[0]!.surfaces[0]!.assessments = [];
  project.objects[0]!.surfaces[0]!.checkpoints = [{} as never];
  expect(() => check(project)).toThrow();
});

function storage(project: Project) {
  const documents = {
    list: vi.fn(async () => [{ id: project.id, revision: 4, text: JSON.stringify(project) }]),
    save: vi.fn(async () => 5),
  };
  const vault = { projects: () => documents } as unknown as LocalVault;
  return { documents, model: localProjects(vault) };
}

it('does not persist a v1 upgrade during listing; saves v2 at the expected revision on mutation', async () => {
  const { model, documents } = storage(legacy());
  const [row] = await model.list();
  expect(row!.version).toBe(1);
  expect(row!.createdAt).toBeUndefined();
  expect(documents.save).not.toHaveBeenCalled();
  const saved = await model.save({ ...row!, name: 'Renamed' });
  expect(saved).toMatchObject({ version: 2, revision: 5, createdAt: null, createdBy: null });
  const args = vi.mocked(documents.save).mock.calls[0] as unknown as unknown[];
  expect(args.slice(0, 2)).toEqual([projectId, 4]);
  const written = JSON.parse(args[2] as string);
  expect(written).toMatchObject({ version: 2, name: 'Renamed', createdAt: null });
  expect(written.revision).toBeUndefined();
  expect(saved.updatedAt).toBeGreaterThan(1234);
});

it('preserves metadata and attachment/journal transaction arguments when saving dedicated assets', async () => {
  const project = upgradeProject(legacy());
  project.assets = [{ id: coverId, purpose: 'cover' }];
  project.cover = { assetId: coverId };
  const { model, documents } = storage(project);
  const attachment = { id: coverId, signal: new AbortController().signal };
  const journal = {
    ref: { project: projectId, surface: surfaceId, source: imageId },
    expected: 0,
    text: '{}',
  };
  await model.save({ ...project, revision: 4 }, attachment, [journal]);
  expect(documents.save).toHaveBeenCalledWith(projectId, 4, expect.any(String), attachment, [
    journal,
  ]);
  await expect(
    model.save({ ...project, revision: 4 }, { ...attachment, id: imageId }),
  ).rejects.toThrow('Missing image attachment');
  expect(documents.save).toHaveBeenCalledTimes(1);
});

it('persists removal of a v1 document’s last child as a v2 mutation', async () => {
  const project: SavedProject = { ...legacy(), revision: 4, objects: [] };
  const { model } = storage(legacy());
  expect(await model.save(project)).toMatchObject({ version: 2, objects: [], revision: 5 });
});

it('keeps public browser status vocabulary separate from visibility and API-compatible', () => {
  expectTypeOf<ProjectVisibility>().toEqualTypeOf<ApiVisibility>();
  expectTypeOf<{ error: 'visibility_conflict' }>().toExtend<ProjectBrowserError>();
  expectTypeOf<{ error: 'not_found' }>().toExtend<ProjectBrowserError>();
  expect(projectVisibilities).toEqual(['private', 'listed']);
  expect(browserItemStatuses).toEqual([
    'local',
    'paused',
    'remote',
    'synced',
    'pending',
    'conflict',
    'error',
    'unknown',
  ]);
});
