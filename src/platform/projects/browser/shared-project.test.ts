import { expect, it } from 'vitest';
import { newProject } from '../projects';
import { parseSharedProject, projectSnapshot } from '../shared-project';

it('accepts empty project and object snapshots while retaining snapshot validation', () => {
  for (const object of [null, 'Empty object']) {
    const project = newProject('Empty', object, null, 'EUR');
    const snapshot = projectSnapshot({ ...project, revision: 1 });
    expect(parseSharedProject(JSON.stringify(snapshot))).toEqual(snapshot);
  }
  expect(() =>
    parseSharedProject(JSON.stringify({ name: 'P', revision: 0, objects: [] })),
  ).toThrow();
  expect(() =>
    parseSharedProject(
      JSON.stringify({ name: 'P', revision: 1, objects: [{ name: 'O', surfaces: null }] }),
    ),
  ).toThrow();
});
