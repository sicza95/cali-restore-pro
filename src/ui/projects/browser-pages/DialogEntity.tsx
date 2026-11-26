import { imageDeck } from '../../../platform/projects/browser/deck';
import type { BrowserItemDescriptor } from '../../../platform/projects/browser-contracts';
import type { JSX } from 'solid-js';
import { DialogItem } from '../browser/dialogs/DialogItem';
import { entityOf } from './types';
import type { Workspace } from './types';
import { usePreviews } from './usePreviews';

export function useDialogEntity(
  ws: () => Workspace,
  item: () => BrowserItemDescriptor,
  projectScope: () => boolean,
) {
  const entity = () => {
    const selected = item();
    const project = ws()
      .projects()
      .find((p) => p.id === selected.projectId);
    if (!project) return undefined;
    const target =
      projectScope() || selected.kind === 'project'
        ? { kind: 'project' as const }
        : selected.kind === 'object'
          ? { kind: 'object' as const, objectId: selected.id }
          : { kind: 'surface' as const, objectId: selected.objectId!, surfaceId: selected.id };
    return entityOf(project, target)?.entity;
  };
  const previews = usePreviews(
    () => ws().vault,
    () => {
      const selected = entity();
      return selected
        ? [
            {
              id: selected.id,
              project: item().projectId,
              cover: !!selected.cover,
              assets: imageDeck(selected),
            },
          ]
        : [];
    },
  );
  return (children?: JSX.Element) => (
    <DialogItem
      language={ws().language}
      kind={projectScope() ? 'project' : item().kind}
      name={entity()?.name ?? item().name}
      preview={entity() ? previews()[entity()!.id] : undefined}
    >
      {children}
    </DialogItem>
  );
}
