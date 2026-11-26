import type { JournalWrite, PendingAttachment } from '../../platform/vault/project-store';
import { useApp } from '../app-context/AppContext';
import {
  createMemo,
  createResource,
  createSignal,
  Match,
  onMount,
  Show,
  Switch,
  untrack,
} from 'solid-js';
import { localProjects } from '../../platform/projects/projects';
import { preserveLegacyProjectSettings } from '../../platform/projects/settings';
import type { SavedProject } from '../../platform/projects/types';
import type { LocalVault } from '../../platform/vault/vault';
import type { Language } from '../account-access/types';
import { projectCopy } from './project-copy';
import { useEditorSync } from './useEditorSync';
import { lazyView } from '../shared/lazyView';
import { projectHref } from '../router/routes';
import { ProjectAccessProvider } from './access';
import { ProjectsLevel } from './browser-pages/ProjectsLevel';
import { ChildLevel } from './browser-pages/ChildLevel';
import { ProjectSettingsDialog } from './browser-pages/SettingsDialogs';
import type { Workspace } from './browser-pages/types';
import './styles.css';

// The editor and the review pages load on demand; the offline worker precaches the chunks.
const surfaceWorkspace = lazyView(() =>
  import('./SurfaceWorkspace').then((m) => m.SurfaceWorkspace),
);
const SurfaceWorkspace = surfaceWorkspace.View;
const ProjectReview = lazyView(() =>
  import('../project-review/ProjectReview').then((m) => m.ProjectReview),
).View;

/**
 * The project area: the shared browser at the root, in a project (objects) and in an object
 * (surfaces), plus the surface editor and the review pages. Every save goes through here.
 */
export function ProjectWorkspace(props: { vault: LocalVault; language: Language }) {
  // Fetch the editor while the project list is read, so opening a surface shows no loading state.
  onMount(() => surfaceWorkspace.preload().catch(() => undefined));
  const app = useApp();
  const c = () => projectCopy[props.language];
  const local = localProjects(untrack(() => props.vault));
  const sync = useEditorSync(
    untrack(() => props.vault),
    () => app.csrf(),
  );
  const [projects, { mutate, refetch }] = createResource<{
    rows: SavedProject[];
    failed?: boolean;
  }>(() =>
    local.list().then(
      (rows) => ({ rows }),
      () => ({ rows: [] as SavedProject[], failed: true }),
    ),
  );
  const route = () => {
    const current = app.router.route();
    return current.name === 'projects' ? current : undefined;
  };
  const [busy, setBusy] = createSignal(false);
  const [failure, setFailure] = createSignal(false);
  const [settingsFor, setSettingsFor] = createSignal<string>();
  const current = () => projects()?.rows.find((project) => project.id === route()?.project);
  const activeReview = () => current() && !current()?.archived && current()?.id;
  const activeSurface = () => {
    const project = current();
    if (!project || project.archived) return;
    for (const object of project.objects) {
      const surface = object.surfaces.find((entry) => entry.id === route()?.surface);
      if (surface) return { object, surface };
    }
  };
  const activeObject = () => current()?.objects.find((object) => object.id === route()?.object);
  // The shell names only what this page shows: not an archived project's review, which says the
  // project is unavailable. The names leave the shell when this screen unmounts (vault locked).
  app.provideNames(() => {
    const project = current();
    if (!project || (route()?.review && project.archived)) return {};
    const shown = activeSurface();
    const object = shown?.object ?? activeObject();
    return {
      [project.id]: project.name,
      ...(object ? { [object.id]: object.name } : {}),
      ...(shown ? { [shown.surface.id]: shown.surface.name } : {}),
    };
  });
  app.provideSurfaceObjects(() => {
    const shown = activeSurface();
    return shown ? { [shown.surface.id]: shown.object.id } : {};
  });
  const navigate = app.router.navigate;
  async function run(task: () => Promise<void>) {
    if (busy()) return false;
    setBusy(true);
    setFailure(false);
    try {
      await task();
      return true;
    } catch {
      setFailure(true);
      return false;
    } finally {
      setBusy(false);
    }
  }
  function update(next: SavedProject) {
    mutate((data) => ({ rows: [...(data?.rows ?? []).filter((p) => p.id !== next.id), next] }));
  }
  async function save(
    project: SavedProject,
    attachment?: PendingAttachment,
    journal?: JournalWrite | JournalWrite[],
  ) {
    // A v1 document keeps the meaning of its saved units and currency when it is upgraded.
    update(await local.save(preserveLegacyProjectSettings(project), attachment, journal));
    void sync.refresh();
  }
  async function remove(project: SavedProject) {
    await local.remove(project);
    mutate((data) => ({ rows: (data?.rows ?? []).filter((p) => p.id !== project.id) }));
    void sync.refresh();
  }
  const workspace: Workspace = {
    get vault() {
      return props.vault;
    },
    get language() {
      return props.language;
    },
    busy,
    run,
    save,
    update,
    remove,
    sync,
    navigate,
    projects: () => projects()?.rows ?? [],
    openSettings(project) {
      if (route()?.project !== project || route()?.surface || route()?.review)
        navigate(projectHref(project));
      setSettingsFor(project);
    },
  };
  const settingsProject = () => projects()?.rows.find(({ id }) => id === settingsFor());
  const browsing = () => !route()?.surface && !route()?.review;
  return (
    <ProjectAccessProvider vault={props.vault}>
      <section
        class="project-workspace"
        classList={{ 'project-browser': browsing() }}
        aria-label={c().hierarchy}
      >
        <Show when={busy() || projects.loading || (route()?.surface && activeSurface())}>
          <p role="status" class="project-workspace-status">
            {busy() ? c().saving : projects.loading ? c().loading : c().surfaceLocal}
          </p>
        </Show>
        <Show when={failure() || projects()?.failed}>
          <p role="alert">{c().error}</p>
          <button
            disabled={busy()}
            onClick={() => {
              setFailure(false);
              void refetch();
            }}
          >
            {c().refresh}
          </button>
        </Show>
        <Show when={!projects.loading && !projects()?.failed}>
          <Switch>
            <Match when={!route()?.project}>
              <ProjectsLevel ws={workspace} />
            </Match>
            <Match when={route()?.surface}>
              <Show
                when={activeSurface()?.surface.id}
                keyed
                fallback={<p role="status">{c().missing}</p>}
              >
                {(id) => {
                  // Keep the mounted route's last value during navigation teardown.
                  const initial = { project: current()!, ...activeSurface()! };
                  const context = createMemo<typeof initial>((previous) => {
                    const project = current();
                    const match = activeSurface();
                    return project && match?.surface.id === id ? { project, ...match } : previous;
                  }, initial);
                  return (
                    <SurfaceWorkspace
                      project={context().project}
                      object={context().object}
                      surface={context().surface}
                      vault={props.vault}
                      language={props.language}
                      busy={busy()}
                      onRun={run}
                      onSave={save}
                      onNavigate={navigate}
                    />
                  );
                }}
              </Show>
            </Match>
            <Match when={route()?.review}>
              <Show when={activeReview()} keyed fallback={<p role="status">{c().missing}</p>}>
                <ProjectReview
                  vault={props.vault}
                  project={current()!}
                  route={route()!.review!}
                  language={props.language}
                  account={app.account()!.id}
                  navigate={navigate}
                />
              </Show>
            </Match>
            <Match when={route()?.object}>
              <Show when={activeObject()?.id} keyed fallback={<p role="status">{c().missing}</p>}>
                {(object) => <ChildLevel ws={workspace} project={current()!} object={object} />}
              </Show>
            </Match>
            <Match when={true}>
              <Show when={current()?.id} keyed fallback={<p role="status">{c().missing}</p>}>
                <ChildLevel ws={workspace} project={current()!} />
              </Show>
            </Match>
          </Switch>
        </Show>
        <Show when={settingsProject()?.id} keyed>
          <ProjectSettingsDialog
            ws={workspace}
            project={settingsProject()!}
            onClose={() => setSettingsFor(undefined)}
          />
        </Show>
      </section>
    </ProjectAccessProvider>
  );
}
