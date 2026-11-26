import { createResource } from 'solid-js';
import type { BrowserItemDescriptor } from '../../../platform/projects/browser-contracts';
import { projectAssetIds } from '../../../platform/projects/browser/assets';
import type { Project } from '../../../platform/projects/types';
import { entityOf } from './types';
import type { Workspace } from './types';

export function useItemSize(
  props: { ws: Workspace; item: BrowserItemDescriptor; hosted: boolean },
  request: <T>(path: string) => Promise<T>,
) {
  const [bytes] = createResource(
    () => {
      const project = props.ws.projects().find((p) => p.id === props.item.projectId);
      return project ? { project, item: props.item, hosted: props.hosted } : undefined;
    },
    async ({ project, item, hosted }) => {
      try {
        if (hosted && item.kind === 'project')
          return (await request<{ bytes: number }>('/hosted-projects/' + project.id + '/storage'))
            .bytes;
        const target =
          item.kind === 'project'
            ? { kind: 'project' as const }
            : item.kind === 'object'
              ? { kind: 'object' as const, objectId: item.id }
              : { kind: 'surface' as const, objectId: item.objectId!, surfaceId: item.id };
        const entity = entityOf(project, target)?.entity;
        if (!entity) return undefined;
        const subtree: Project =
          'objects' in entity
            ? entity
            : {
                ...project,
                assets: [],
                cover: undefined,
                overrides: undefined,
                objects:
                  'surfaces' in entity
                    ? [entity]
                    : [
                        {
                          ...project.objects.find((o) => o.id === item.objectId)!,
                          cover: undefined,
                          overrides: undefined,
                          surfaces: [entity],
                        },
                      ],
              };
        const sizes = await Promise.all(
          [...projectAssetIds(subtree)].map((id) =>
            props.ws.vault.files().storageBytes({ project: project.id, id }),
          ),
        );
        return sizes.reduce(
          (sum, size) => sum + size,
          new TextEncoder().encode(JSON.stringify(entity)).length + 32,
        );
      } catch {
        return undefined;
      }
    },
  );
  return bytes;
}
