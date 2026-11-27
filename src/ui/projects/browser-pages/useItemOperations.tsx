import { createResource, createSignal, Show } from 'solid-js';
import type { BrowserItemDescriptor } from '../../../platform/projects/browser-contracts';
import type { HostedProjectVisibility } from '../../../platform/api';
import { entityOf } from './types';
import { copyBrowserItem } from '../../../platform/projects/browser/copy-item';
import { useApp } from '../../app-context/AppContext';
import { itemActionCopy } from '../browser/item-actions/copy';
import type { ItemAction } from '../browser/item-actions/types';
import { ItemOperationDialogs } from './ItemOperationDialogs';
import type { Workspace } from './types';

export type ItemDialog = {
  item: BrowserItemDescriptor;
  kind: 'share' | 'manage' | 'reports' | 'unhost';
};

export function useItemOperations(ws: Workspace) {
  const app = useApp();
  const c = () => itemActionCopy[ws.language];
  const [dialog, setDialog] = createSignal<ItemDialog>();
  const [failure, setFailure] = createSignal('');
  const [hosting, { refetch }] = createResource(
    () =>
      ws
        .projects()
        .map((p) => p.id)
        .join(' '),
    async () => {
      const rows = await Promise.all(
        ws.projects().map(async (project) => {
          try {
            const visibility = await app.request<HostedProjectVisibility>(
              '/hosted-projects/' + project.id + '/visibility',
            );
            await ws.sync.sync.hosting(project.id, true);
            return [project.id, visibility] as const;
          } catch (error) {
            if (error instanceof Error && error.message === 'not_found') {
              await ws.sync.sync.hosting(project.id, false);
              return [project.id, false] as const;
            }
            const known = await ws.sync.sync.hosting(project.id);
            return [project.id, known] as const;
          }
        }),
      );
      return Object.fromEntries(rows);
    },
  );
  const hosted = (id: string) =>
    !!hosting()?.[id] || !!ws.sync.state()?.checkpoints.some((base) => base.project === id);
  const localOnly = (id: string) =>
    hosting()?.[id] === false && !ws.sync.state()?.checkpoints.some((base) => base.project === id);
  const online = (item: BrowserItemDescriptor) =>
    item.status === 'remote' ||
    !!ws.sync.state()?.checkpoints.some((base) => base.project === item.projectId && !base.paused);
  const run = (task: () => Promise<void>) => {
    setFailure('');
    void ws
      .run(async () => {
        try {
          await task();
        } catch (error) {
          setFailure(c().failed);
          throw error;
        }
      })
      .then(() => {
        void ws.sync.refresh();
        void refetch();
      });
  };
  const actions = (item: BrowserItemDescriptor): readonly ItemAction[] => {
    const project = ws.projects().find((p) => p.id === item.projectId);
    const reason = !project
      ? c().projectScope
      : item.access !== 'editable'
        ? c().access
        : ws.busy()
          ? c().failed
          : undefined;
    const base = ws.sync.state()?.checkpoints.find((base) => base.project === item.projectId);
    const target =
      item.kind === 'project'
        ? { kind: 'project' as const }
        : item.kind === 'object'
          ? { kind: 'object' as const, objectId: item.id }
          : { kind: 'surface' as const, objectId: item.objectId!, surfaceId: item.id };
    const entity = project ? entityOf(project, target)?.entity : undefined;
    const visibility =
      typeof hosting()?.[item.projectId] === 'object'
        ? (hosting()?.[item.projectId] as HostedProjectVisibility).visibility
        : item.visibility;
    const open = (kind: ItemDialog['kind']) => setDialog({ item, kind });
    return [
      {
        id: 'download',
        label: c().download,
        icon: 'download',
        reason,
        run: () =>
          run(async () => {
            const result = await ws.vault.projectBackups().export(item.projectId);
            const url = URL.createObjectURL(result.blob);
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = (project?.name ?? 'project') + '.crproject';
            anchor.click();
            window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
          }),
      },
      {
        id: 'hosting',
        label: c().hosting,
        icon: 'cloud',
        reason,
        checked: hosted(item.projectId),
        run: () => {
          if (hosted(item.projectId)) open('unhost');
          else
            run(async () => {
              await app.request(
                '/hosted-projects/' + item.projectId,
                project?.organisation ? { organisation: project.organisation } : {},
                'PUT',
              );
              await ws.sync.sync.hosting(item.projectId, true);
              await ws.sync.initialSync(project!);
            });
        },
      },
      {
        id: 'sync',
        label: c().sync,
        icon: 'sync',
        reason: reason ?? (!hosted(item.projectId) ? c().hosting : undefined),
        checked: !!base && !base.paused,
        run: () =>
          run(async () => {
            if (base && !base.paused) await ws.sync.sync.setPaused(item.projectId, true);
            else await ws.sync.initialSync(project!);
          }),
      },
      {
        id: 'listed',
        label: c().listed,
        icon: 'organisation',
        supplement: visibility === 'listed' ? 'globe' : 'lock',
        reason: reason ?? (!hosted(item.projectId) ? c().hosting : undefined),
        checked: visibility === 'listed',
        run: () =>
          run(async () => {
            const current = await app.request<HostedProjectVisibility>(
              '/hosted-projects/' + item.projectId + '/visibility',
            );
            await app.request(
              '/hosted-projects/' + item.projectId + '/visibility',
              {
                visibility: current.visibility === 'listed' ? 'private' : 'listed',
                version: current.version,
                name: project!.name,
              },
              'PATCH',
            );
          }),
      },
      {
        id: 'copy',
        label: c().copy,
        icon: 'copy',
        reason,
        run: () =>
          run(async () => {
            const copied = await copyBrowserItem(
              ws.vault,
              project!,
              target,
              c().copyName(item.name),
              app.account()?.id ?? null,
            );
            if (target.kind === 'project') await ws.sync.sync.hosting(copied.id, false);
            ws.update(copied);
          }),
      },
      { id: 'share', label: c().share, icon: 'share', reason, run: () => open('share') },
      { id: 'manage', label: c().manage, icon: 'settings', reason, run: () => open('manage') },
      { id: 'reports', label: c().reports, icon: 'report', reason, run: () => open('reports') },
      {
        id: 'archive',
        label: entity?.archived ? c().unarchive : c().archive,
        icon: 'archive',
        reason,
        run: () =>
          run(async () => {
            const next = structuredClone(project!);
            const selected = entityOf(next, target);
            if (!selected) return;
            selected.entity.archived = !entity?.archived;
            selected.entity.updatedAt = Date.now();
            await ws.save(next);
          }),
      },
    ];
  };
  const dialogs = () => (
    <>
      <Show when={failure()}>
        <p role="alert">{failure()}</p>
      </Show>
      <Show when={dialog()} keyed>
        {(value) => (
          <ItemOperationDialogs
            ws={ws}
            value={value}
            hosted={hosted(value.item.projectId)}
            onClose={() => setDialog(undefined)}
            onChanged={() => {
              void refetch();
              void ws.sync.refresh();
            }}
          />
        )}
      </Show>
    </>
  );
  const describe = (item: BrowserItemDescriptor): BrowserItemDescriptor => ({
    ...item,
    visibility:
      typeof hosting()?.[item.projectId] === 'object'
        ? (hosting()?.[item.projectId] as HostedProjectVisibility).visibility
        : item.visibility,
    hosted: hosted(item.projectId),
    status: hosted(item.projectId) && item.status === 'local' ? 'paused' : item.status,
  });
  return { actions, online, hosted, localOnly, dialogs, describe };
}
