import { expect, it } from 'vitest';
import { newProject, newObject, newSurface, validateProject } from '../projects';
import { copySubtree } from './copy-item';

it('copies only the selected subtree, preserving file references and defaults with fresh entity IDs', () => {
  const project = newProject('Chapel', null, null, 'EUR');
  const object = newObject('Wall');
  object.surfaces.push(newSurface('Plaster'));
  project.objects.push(object);
  const result = copySubtree(project, { kind: 'object', objectId: object.id }, 'Wall (copy)', null);
  expect(result.objects).toHaveLength(2);
  expect(result.objects[1]!.id).not.toBe(object.id);
  expect(result.objects[1]!.surfaces[0]!.id).not.toBe(object.surfaces[0]!.id);
  expect(project.objects).toHaveLength(1);
  expect(() => validateProject(result, project.id)).not.toThrow();
});
