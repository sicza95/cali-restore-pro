import { useItemOperations } from './useItemOperations';
import { createMemo, Show, untrack } from 'solid-js';
import type { BrowserItemDescriptor } from '../../../platform/projects/browser-contracts';
import { objectItems, surfaceItems } from '../../../platform/projects/browser/browser-model';
import { deletionJournals } from '../../../platform/projects/browser/deletion';
import { browserMutations, deletionCounts } from '../../../platform/projects/browser/mutations';
import type { BrowserTarget } from '../../../platform/projects/browser/mutations';
import { preserveLegacyProjectSettings } from '../../../platform/projects/settings';
import type { SavedProject } from '../../../platform/projects/types';
import { useApp } from '../../app-context/AppContext';
import { objectHref, projectHref } from '../../router/routes';
import { browserCopy } from '../browser/browser-copy';
import { BrowserPage } from './BrowserPage';
import { pageCopy } from './copy';
import { deckOf, ItemInspector } from './ItemInspector';
import { entityOf } from './types';
import type { Workspace } from './types';
import { usePreviews } from './usePreviews';
import { useNearViewport } from './useNearViewport';
import { subtreePhotos, useOriginals } from './useOriginals';

/** Objects of a project, or surfaces of one object (`object` set). Empty levels are valid. */
export function ChildLevel(props: { ws: Workspace; project: SavedProject; object?: string }) {
  const app = useApp();
  const ws = untrack(() => props.ws);
  const operations = useItemOperations(ws);
  const c = () => pageCopy[ws.language];
  const copy = () => browserCopy[ws.language];
  const mutations = browserMutations(ws.vault, app.account()?.id ?? null);
  const level = () => (props.object ? 'surface' : 'object');
  const targetOf = (item: BrowserItemDescriptor): Exclude<BrowserTarget, { kind: 'project' }> =>
    item.kind === 'object'
      ? { kind: 'object', objectId: item.id }
      : { kind: 'surface', objectId: item.objectId!, surfaceId: item.id };
  const entity = (item: BrowserItemDescriptor) => entityOf(props.project, targetOf(item))?.entity;
  // Thumbnails and originals checks load only for tiles near the visible part of the level.
  const near = useNearViewport();
  const nearby = () => items().filter((item) => near(item.id));
  const originals = useOriginals(
    () => ws.vault,
    () => nearby().map((item) => ({ project: props.project.id, photos: photosOf(item) })),
  );
  const photosOf = (item: BrowserItemDescriptor) => {
    const found = entity(item);
    return found ? subtreePhotos(found) : [];
  };
  const items = createMemo(() => {
    const context = { status: ws.sync.itemStatus(props.project) };
    return props.object
      ? surfaceItems(props.project, props.object, context)
      : objectItems(props.project, context);
  });
  const described = createMemo(() =>
    items().map((item) =>
      operations.describe({ ...item, originals: originals(props.project.id, photosOf(item)) }),
    ),
  );
  const previews = usePreviews(
    () => ws.vault,
    () =>
      nearby().flatMap((item) => {
        const found = entity(item);
        return found ? [{ id: item.id, project: props.project.id, ...deckOf(found) }] : [];
      }),
  );
  const archived = () =>
    props.project.archived ||
    props.project.objects.find((object) => object.id === props.object)?.archived
      ? c().archivedReason
      : undefined;
  const latest = () => preserveLegacyProjectSettings(props.project);
  const saved = (project: SavedProject) => {
    ws.update(project);
    void ws.sync.refresh();
    return project;
  };
  async function create(name: string) {
    const before = new Set(
      props.object
        ? props.project.objects.find(({ id }) => id === props.object)?.surfaces.map(({ id }) => id)
        : props.project.objects.map(({ id }) => id),
    );
    const next = saved(
      props.object
        ? await mutations.createSurface(latest(), props.object, name)
        : await mutations.createObject(latest(), name),
    );
    const children = props.object
      ? (next.objects.find(({ id }) => id === props.object)?.surfaces ?? [])
      : next.objects;
    return children.find(({ id }) => !before.has(id))?.id;
  }
  async function renameItem(item: BrowserItemDescriptor, name: string) {
    saved(await mutations.rename(latest(), targetOf(item), name));
  }
  async function remove(item: BrowserItemDescriptor) {
    const target = targetOf(item);
    saved(
      target.kind === 'object'
        ? await mutations.deleteObject(latest(), target.objectId)
        : await mutations.deleteSurface(latest(), target.objectId, target.surfaceId),
    );
    return undefined;
  }
  return (
    <>
      <BrowserPage
        language={ws.language}
        level={level()}
        scope={props.object ?? props.project.id}
        title={copy().levels[level()]}
        actions={operations.actions}
        online={operations.online}
        items={described()}
        previews={previews()}
        archived={(item) => entity(item)?.archived}
        notice={
          <Show when={props.project.archived}>
            <p class="project-browser-notice" role="status">
              {c().archivedNotice}
            </p>
          </Show>
        }
        newDisabledReason={archived()}
        changeReason={(item) =>
          archived() ?? (entity(item)?.archived ? c().archivedReason : undefined)
        }
        onParent={() => ws.navigate(props.object ? projectHref(props.project.id) : projectHref())}
        onOpen={(item) =>
          ws.navigate(
            item.kind === 'object'
              ? objectHref(props.project.id, item.id)
              : projectHref(props.project.id, item.id),
          )
        }
        onCreate={create}
        onRename={renameItem}
        deletion={(item) => {
          const target = targetOf(item);
          const counts = deletionCounts(props.project, target);
          return {
            descendants: { objects: 0, surfaces: target.kind === 'object' ? counts.surfaces : 0 },
            // Same guard as the mutation: drafts and unreadable journals block the deletion.
            check: async () => {
              const found = entity(item);
              if (!found) return undefined;
              const surfaces = 'surfaces' in found ? found.surfaces : [found as never];
              try {
                await deletionJournals(props.project.id, surfaces, (ref) =>
                  ws.vault.projects().readJournal(ref),
                );
                return undefined;
              } catch {
                return c().blockedDelete;
              }
            },
          };
        }}
        onDelete={remove}
        onSettings={() => ws.openSettings(props.project.id)}
        inspector={(item, close) => (
          <ItemInspector
            ws={ws}
            item={item()}
            preview={previews()[item().id]}
            onClose={close}
            actions={operations.actions(item())}
            hosted={operations.hosted(item().projectId)}
          />
        )}
      />
      {operations.dialogs()}
    </>
  );
}
