import { useItemOperations } from './useItemOperations';
import { createMemo, createResource, createSignal, Show, untrack } from 'solid-js';
import type { OrganisationProjectDirectory } from '../../../platform/api';
import type { BrowserItemDescriptor } from '../../../platform/projects/browser-contracts';
import { projectItems } from '../../../platform/projects/browser/browser-model';
import type { DirectoryBrowserProject } from '../../../platform/projects/browser/browser-model';
import { browserMutations } from '../../../platform/projects/browser/mutations';
import { deletionJournals } from '../../../platform/projects/browser/deletion';
import { newProject } from '../../../platform/projects/projects';
import { preserveLegacyProjectSettings } from '../../../platform/projects/settings';
import type { DeletionStatus } from '../../../platform/api/types.gen';
import { useApp } from '../../app-context/AppContext';
import { projectOrganisation, useOrganisations } from '../../organisations/organisation-state';
import { projectHref } from '../../router/routes';
import { loadPreferences } from '../../settings/preferences/utils';
import { browserCopy } from '../browser/browser-copy';
import { DialogShell } from '../browser/dialogs/DialogShell';
import { ProjectBackup } from '../ProjectBackup';
import { BrowserPage, ShownError } from './BrowserPage';
import { pageCopy } from './copy';
import { deckOf, ItemInspector } from './ItemInspector';
import { RootSettingsDialog } from './SettingsDialogs';
import type { Workspace } from './types';
import { usePreviews } from './usePreviews';
import { useNearViewport } from './useNearViewport';
import { subtreePhotos, useOriginals } from './useOriginals';

/** Directory pages are bounded; a very large organisation shows its first thousand cards. */
const directoryPages = 20;

/** The root level: projects on this device, the account's online-only projects, and listed cards. */
export function ProjectsLevel(props: { ws: Workspace }) {
  const app = useApp();
  const orgs = useOrganisations();
  const ws = untrack(() => props.ws);
  const operations = useItemOperations(ws);
  const c = () => pageCopy[ws.language];
  const copy = () => browserCopy[ws.language];
  const mutations = browserMutations(ws.vault, app.account()?.id ?? null);
  const [dialog, setDialog] = createSignal<'settings' | 'import'>();
  const key = () => orgs.selected()?.id ?? null;
  // Missing or departed organisations count as Personal, as the project list always did.
  const inOrganisation = (organisation?: string) =>
    !orgs.selected() || projectOrganisation(organisation, orgs.list()) === orgs.selected()!.id;
  const local = createMemo(() =>
    ws
      .projects()
      .filter((project) => inOrganisation(project.organisation))
      .map((project) => ({ ...project, organisation: key() ?? undefined })),
  );
  const [remote, { refetch: refetchRemote }] = createResource(
    // Keyed by the set of local IDs: saving a project must not download the online list again.
    () =>
      ws
        .projects()
        .map(({ id }) => id)
        .sort()
        .join(' '),
    async (ids) => {
      try {
        return { rows: await ws.sync.cloud.list(new Set(ids.split(' '))) };
      } catch {
        return { rows: [], failed: true };
      }
    },
  );
  const [directory, { refetch: refetchDirectory }] = createResource(
    () => orgs.selected()?.id,
    async (org) => {
      const cards: DirectoryBrowserProject[] = [];
      let after: string | null = null;
      try {
        for (let page = 0; page < directoryPages; page++) {
          const query: string = after
            ? '?after=' + encodeURIComponent(after) + '&limit=50'
            : '?limit=50';
          const result: OrganisationProjectDirectory = await app.request(
            '/organisations/' + encodeURIComponent(org) + '/projects' + query,
          );
          cards.push(...result.projects);
          after = result.next;
          if (!after) break;
        }
        return { cards };
      } catch {
        return { cards, failed: true };
      }
    },
  );
  // Thumbnails and originals checks load only for tiles near the visible part of the list.
  const near = useNearViewport();
  const nearby = () => local().filter((project) => near(project.id));
  const originals = useOriginals(
    () => ws.vault,
    () => nearby().map((project) => ({ project: project.id, photos: subtreePhotos(project) })),
  );
  const items = createMemo(() =>
    projectItems({
      organisation: key(),
      local: local(),
      remote: (remote.latest?.rows ?? [])
        .filter((row) => inOrganisation(row.organisation))
        .map((row) => ({ ...row, organisation: key() ?? row.organisation })),
      directory: directory.latest?.cards,
      context: Object.fromEntries(
        local().map((project) => [
          project.id,
          {
            status: ws.sync.itemStatus(project),
            originals: originals(project.id, subtreePhotos(project)),
          },
        ]),
      ),
    }).map(operations.describe),
  );
  const previews = usePreviews(
    () => ws.vault,
    () => nearby().map((project) => ({ id: project.id, project: project.id, ...deckOf(project) })),
  );
  const find = (id: string) => ws.projects().find((project) => project.id === id);
  const missing = (item: BrowserItemDescriptor) => (find(item.id) ? undefined : c().remoteReason);
  const refresh = () => {
    void refetchRemote();
    void refetchDirectory();
  };
  async function create(name: string) {
    const account = app.account()!.id;
    const project = newProject(
      name,
      null,
      null,
      loadPreferences(account).currency,
      orgs.selected()?.id,
      account,
    );
    await ws.sync.sync.hosting(project.id, false);
    await ws.save(project);
    return project.id;
  }
  async function renameItem(item: BrowserItemDescriptor, name: string) {
    const project = find(item.id);
    if (!project) throw new Error('Project not on this device');
    ws.update(
      await mutations.rename(preserveLegacyProjectSettings(project), { kind: 'project' }, name),
    );
    void ws.sync.refresh();
  }
  // Never hosted: no checkpoint once the local sync state has loaded. Unknown counts as hosted.
  const localOnly = (id: string) => {
    const project = find(id);
    return !!project && !!ws.sync.state() && operations.localOnly(id);
  };
  /** The same draft guard as object and surface deletion, over the whole project. */
  async function draftsBlock(id: string) {
    const project = find(id);
    if (!project) return undefined;
    try {
      await deletionJournals(
        project.id,
        project.objects.flatMap((object) => object.surfaces),
        (ref) => ws.vault.projects().readJournal(ref),
      );
      return undefined;
    } catch {
      return c().blockedDelete;
    }
  }
  async function remove(item: BrowserItemDescriptor) {
    const project = find(item.id);
    if (project && localOnly(item.id)) {
      if (await draftsBlock(item.id)) throw new ShownError(c().blockedDelete);
      await ws.remove(project);
      return undefined;
    }
    // The existing hosted trash: recoverable until the server's deadline.
    const result = await app.run(
      '/hosted-projects/' + item.id + '/deletion',
      { action: 'delete', confirm: true },
      'success',
    );
    const status = result as Partial<DeletionStatus> | false;
    if (!status) throw new ShownError(c().trashFailed);
    return status.recoverUntil
      ? c().trashed(
          new Intl.DateTimeFormat(ws.language, { dateStyle: 'long', timeStyle: 'short' }).format(
            new Date(status.recoverUntil),
          ),
        )
      : undefined;
  }
  return (
    <>
      <BrowserPage
        language={ws.language}
        level="project"
        scope="root"
        title={copy().levels.project}
        items={items()}
        previews={previews()}
        actions={operations.actions}
        online={operations.online}
        archived={(item) => find(item.id)?.archived}
        creatorName={(id) => (id === app.account()?.id ? app.account()?.email : undefined)}
        remoteUnavailable={!!remote.latest?.failed || !!directory.latest?.failed}
        changeReason={(item) =>
          missing(item) ?? (find(item.id)?.archived ? c().archivedReason : undefined)
        }
        onRetry={refresh}
        onOpen={(item) => {
          if (find(item.id)) return ws.navigate(projectHref(item.id));
          void ws.run(async () => {
            const received = await ws.sync.cloud.open(item.id);
            if (received.created) ws.update(received.document);
            ws.navigate(projectHref(received.project));
            void ws.sync.refresh();
          });
        }}
        onCreate={create}
        onRename={renameItem}
        deletion={(item) => {
          const project = find(item.id);
          return {
            descendants: {
              objects: project?.objects.length ?? null,
              surfaces: project?.objects.reduce((sum, o) => sum + o.surfaces.length, 0) ?? null,
            },
            permanent: localOnly(item.id),
            check: project ? () => draftsBlock(item.id) : undefined,
          };
        }}
        onDelete={remove}
        onSettings={() => setDialog('settings')}
        onImport={() => setDialog('import')}
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
      <Show when={dialog() === 'settings'}>
        <RootSettingsDialog
          ws={ws}
          localName={(id) => find(id)?.name}
          onClose={() => setDialog(undefined)}
        />
      </Show>
      <Show when={dialog() === 'import'}>
        <DialogShell
          title={copy().importBackup}
          closeLabel={copy().close}
          onClose={() => setDialog(undefined)}
        >
          <ProjectBackup
            vault={ws.vault}
            language={ws.language}
            busy={ws.busy()}
            run={ws.run}
            onRestored={(project) => {
              ws.update(project);
              setDialog(undefined);
              ws.navigate(projectHref(project.id));
            }}
          />
        </DialogShell>
      </Show>
    </>
  );
}
