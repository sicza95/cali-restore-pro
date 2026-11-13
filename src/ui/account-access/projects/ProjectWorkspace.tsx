import type { PendingAttachment } from '../../../platform/vault/project-store';
/* eslint-disable solid/reactivity -- Project commands are deferred event callbacks, not render effects. */
import {
  createResource,
  createSignal,
  For,
  Match,
  onCleanup,
  Show,
  Switch,
  untrack,
} from 'solid-js';
import { localProjects, newProject } from '../../../platform/projects/projects';
import type { SavedProject } from '../../../platform/projects/types';
import type { LocalVault } from '../../../platform/vault/vault';
import type { Language } from '../types';
import type { createAccountAccess } from '../createAccountAccess';
import { ProjectInvitations } from '../invitations/ProjectInvitations';
import { projectSnapshot } from '../../../platform/projects/shared-project';
import { ProjectDetail } from './ProjectDetail';
import { ProjectLifecycle } from './ProjectLifecycle';
import { ProjectBackup } from './ProjectBackup';
import { projectCopy } from './project-copy';
import { loadPreferences } from '../settings/preferences/utils';
import { NameForm } from './forms';
import { ReceiveProjectKey } from './ProjectKeyTransfer';
import { ProjectSync } from './ProjectSync';
import { useEditorSync } from './useEditorSync';
import { ProjectReview, ProjectReviewLinks } from '../project-review/ProjectReview';
import { SurfaceWorkspace } from './SurfaceWorkspace';
import { followProjectLink, projectHref, projectRoute } from './project-route';
import { syncCopy } from './sync-copy';
import './styles.css';

export function ProjectWorkspace(props: {
  vault: LocalVault;
  language: Language;
  model: ReturnType<typeof createAccountAccess>;
}) {
  const c = () => projectCopy[props.language];
  const local = localProjects(untrack(() => props.vault));
  const sync = useEditorSync(
    untrack(() => props.vault),
    () => props.model.csrf(),
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
  const [route, setRoute] = createSignal(projectRoute(location.pathname));
  const [sort, setSort] = createSignal('recent');
  const [query, setQuery] = createSignal('');
  const [archived, setArchived] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [failure, setFailure] = createSignal(false);
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
  const visible = () =>
    (projects()?.rows ?? [])
      .filter(
        (p) =>
          p.archived === archived() &&
          p.name
            .toLocaleLowerCase(props.language)
            .includes(query().trim().toLocaleLowerCase(props.language)),
      )
      .sort(
        (a, b) =>
          (sort() === 'recent' ? b.updatedAt - a.updatedAt : 0) ||
          a.name.localeCompare(b.name, props.language),
      );
  function rowSync(project: SavedProject) {
    const status = sync.statusKey(project);
    return status === 'disabled' ? c().local : syncCopy[props.language][status];
  }
  function navigate(href: string) {
    if (href === location.pathname) return;
    history.pushState(null, '', href);
    pop();
  }
  const pop = () => setRoute(projectRoute(location.pathname));
  window.addEventListener('popstate', pop);
  onCleanup(() => window.removeEventListener('popstate', pop));
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
  async function save(project: SavedProject, attachment?: PendingAttachment) {
    update(await local.save(project, attachment));
    void sync.refresh();
  }
  return (
    <section class="project-workspace" aria-label={c().hierarchy}>
      <Show when={!route()?.review}>
        <a class="project-back" data-control-id="projects.offline" href="/offline-originals">
          {c().offlineShelf}
        </a>
      </Show>
      <Show when={!route()?.review || busy() || projects.loading}>
        <p role="status">
          {busy()
            ? c().saving
            : projects.loading
              ? c().loading
              : current() &&
                  (!route()?.surface || activeSurface()) &&
                  (!route()?.review || !current()?.archived)
                ? route()?.surface
                  ? c().surfaceLocal
                  : c().local
                : ''}
        </p>
      </Show>
      <Show when={failure() || projects()?.failed}>
        <p role="alert">{c().error}</p>
        <button
          class="secondary"
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
        <Show
          when={route()?.project}
          fallback={
            <>
              <NameForm
                controlId="projects.create"
                label={c().name}
                action={c().add}
                disabled={busy()}
                onSubmit={(name) =>
                  run(async () => {
                    const project = newProject(
                      name,
                      c().firstObject,
                      c().firstSurface,
                      loadPreferences(props.model.account()!.id).currency,
                    );
                    await save(project);
                    navigate(projectHref(project.id));
                  })
                }
              />
              <div class="project-fields">
                <label>
                  {c().search}
                  <input
                    type="search"
                    data-control-id="projects.search"
                    value={query()}
                    onInput={(e) => setQuery(e.currentTarget.value)}
                  />
                </label>
                <label>
                  {c().sort}
                  <select
                    data-control-id="projects.sort"
                    value={sort()}
                    onChange={(event) => setSort(event.currentTarget.value)}
                  >
                    <option value="recent">{c().recent}</option>
                    <option value="name">{c().byName}</option>
                  </select>
                </label>
                <label class="confirmation">
                  <input
                    type="checkbox"
                    data-control-id="projects.archived"
                    checked={archived()}
                    onChange={(e) => setArchived(e.currentTarget.checked)}
                  />
                  {c().archived}
                </label>
              </div>
              <ul class="project-register">
                <For each={visible()} fallback={<li>{c().empty}</li>}>
                  {(project) => (
                    <li>
                      <a
                        data-control-id="projects.open"
                        href={projectHref(project.id)}
                        onClick={(event) => followProjectLink(event, navigate)}
                      >
                        {project.name}
                      </a>
                      <small>{rowSync(project)}</small>
                      <time dateTime={new Date(project.updatedAt).toISOString()}>
                        {new Intl.DateTimeFormat(props.language, { dateStyle: 'medium' }).format(
                          project.updatedAt,
                        )}
                      </time>
                    </li>
                  )}
                </For>
              </ul>
              <ReceiveProjectKey
                language={props.language}
                busy={busy()}
                model={sync.transfer}
                run={run}
                onReceived={(received) => {
                  if (received.created) update(received.document);
                  navigate(projectHref(received.project));
                  void sync.refresh();
                }}
              />
              <ProjectBackup
                vault={props.vault}
                language={props.language}
                busy={busy()}
                run={run}
                onRestored={(project) => {
                  update(project);
                  navigate(projectHref(project.id));
                }}
              />
              <ProjectLifecycle model={props.model} />
            </>
          }
        >
          <Show when={!route()?.review || !activeReview()}>
            <a
              class="project-back"
              href="/projects"
              data-control-id="project.library"
              onClick={(event) => followProjectLink(event, navigate)}
            >
              {c().back}
            </a>
          </Show>
          <Switch>
            <Match when={route()?.surface}>
              <Show
                when={activeSurface()?.surface.id}
                keyed
                fallback={<p role="status">{c().missing}</p>}
              >
                {(id) => (
                  <SurfaceWorkspace
                    project={current()!}
                    object={activeSurface()!.object}
                    surface={activeSurface()!.object.surfaces.find((surface) => surface.id === id)!}
                    vault={props.vault}
                    language={props.language}
                    busy={busy()}
                    onRun={run}
                    onSave={save}
                    onNavigate={navigate}
                  />
                )}
              </Show>
            </Match>
            <Match when={route()?.review}>
              <Show when={activeReview()} keyed fallback={<p role="status">{c().missing}</p>}>
                <ProjectReview
                  vault={props.vault}
                  project={current()!}
                  route={route()!.review!}
                  language={props.language}
                  account={props.model.account()!.id}
                  navigate={navigate}
                />
              </Show>
            </Match>
            <Match when={true}>
              <Show when={current()?.id} keyed fallback={<p role="status">{c().missing}</p>}>
                {(id) => (
                  <>
                    <Show when={!current()!.archived}>
                      <ProjectReviewLinks
                        project={id}
                        language={props.language}
                        navigate={navigate}
                      />
                    </Show>
                    <ProjectDetail
                      project={current()!}
                      language={props.language}
                      vault={props.vault}
                      busy={busy()}
                      onRun={run}
                      onSave={save}
                      onNavigate={navigate}
                      sharing={
                        <Show when={!current()!.archived && current()!.id} keyed>
                          {(id) => (
                            <ProjectInvitations
                              projectId={id}
                              project={projectSnapshot(current()!)}
                              originalIds={[
                                ...new Set(
                                  current()!.objects.flatMap((object) =>
                                    object.surfaces.flatMap((surface) =>
                                      surface.images.map((image) => image.id),
                                    ),
                                  ),
                                ),
                              ]}
                              canHost
                              model={props.model}
                              vault={props.vault}
                            />
                          )}
                        </Show>
                      }
                    />
                    <ProjectLifecycle model={props.model} project={id} />
                    <Show when={current()!.id} keyed>
                      {(id) => (
                        <ProjectBackup
                          project={id}
                          vault={props.vault}
                          language={props.language}
                          busy={busy()}
                          run={run}
                        />
                      )}
                    </Show>
                    <Show when={current()!.id} keyed>
                      {(id: string) => (
                        <ProjectSync
                          projectId={id}
                          project={current()!}
                          language={props.language}
                          model={sync}
                          busy={busy()}
                          run={run}
                          onResolved={update}
                        />
                      )}
                    </Show>
                  </>
                )}
              </Show>
            </Match>
          </Switch>
        </Show>
      </Show>
    </section>
  );
}
