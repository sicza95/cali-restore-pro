/* eslint-disable solid/reactivity -- Project commands are deferred event callbacks, not render effects. */
import { createResource, createSignal, For, onCleanup, Show, untrack } from 'solid-js';
import { localProjects, newProject } from '../../../platform/projects/projects';
import type { SavedProject } from '../../../platform/projects/types';
import type { LocalVault } from '../../../platform/vault/vault';
import type { Language } from '../types';
import type { createAccountAccess } from '../createAccountAccess';
import { ProjectInvitations } from '../invitations/ProjectInvitations';
import { projectSnapshot } from '../../../platform/projects/shared-project';
import { ProjectDetail } from './ProjectDetail';
import { ProjectBackup } from './ProjectBackup';
import { projectCopy } from './project-copy';
import { NameForm } from './forms';
import { ReceiveProjectKey } from './ProjectKeyTransfer';
import { ProjectSync } from './ProjectSync';
import { useEditorSync } from './useEditorSync';
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
  const [selected, setSelected] = createSignal(location.pathname.split('/')[2] || '');
  const [query, setQuery] = createSignal('');
  const [archived, setArchived] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [failure, setFailure] = createSignal(false);
  const current = () => projects()?.rows.find((project) => project.id === selected());
  const visible = () =>
    (projects()?.rows ?? [])
      .filter(
        (p) =>
          p.archived === archived() &&
          p.name
            .toLocaleLowerCase(props.language)
            .includes(query().trim().toLocaleLowerCase(props.language)),
      )
      .sort((a, b) => b.updatedAt - a.updatedAt || a.name.localeCompare(b.name, props.language));
  function navigate(id: string) {
    history.pushState(null, '', id ? '/projects/' + id : '/projects');
    setSelected(id);
  }
  const pop = () => setSelected(location.pathname.split('/')[2] || '');
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
  async function save(project: SavedProject) {
    update(await local.save(project));
    void sync.refresh();
  }
  return (
    <section class="project-workspace" aria-label={c().hierarchy}>
      <p role="status">
        {busy() ? c().saving : projects.loading ? c().loading : projects()?.failed ? '' : c().local}
      </p>
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
          when={selected()}
          fallback={
            <>
              <NameForm
                label={c().name}
                action={c().add}
                disabled={busy()}
                onSubmit={(name) =>
                  run(async () => {
                    const project = newProject(
                      name,
                      c().firstObject,
                      c().firstSurface,
                      props.language === 'hu' ? 'HUF' : 'EUR',
                    );
                    await save(project);
                    navigate(project.id);
                  })
                }
              />
              <ReceiveProjectKey
                language={props.language}
                busy={busy()}
                model={sync.transfer}
                run={run}
                onReceived={(received) => {
                  if (received.created) update(received.document);
                  navigate(received.project);
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
                  navigate(project.id);
                }}
              />
              <div class="project-fields">
                <label>
                  {c().search}
                  <input
                    type="search"
                    value={query()}
                    onInput={(e) => setQuery(e.currentTarget.value)}
                  />
                </label>
                <label class="confirmation">
                  <input
                    type="checkbox"
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
                        href={'/projects/' + project.id}
                        onClick={(e) => {
                          if (!e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) {
                            e.preventDefault();
                            navigate(project.id);
                          }
                        }}
                      >
                        {project.name}
                      </a>
                      <time dateTime={new Date(project.updatedAt).toISOString()}>
                        {new Intl.DateTimeFormat(props.language, { dateStyle: 'medium' }).format(
                          project.updatedAt,
                        )}
                      </time>
                    </li>
                  )}
                </For>
              </ul>
            </>
          }
        >
          <a
            class="project-back"
            href="/projects"
            onClick={(e) => {
              if (!e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) {
                e.preventDefault();
                navigate('');
              }
            }}
          >
            {c().back}
          </a>
          <Show when={current()} fallback={<p>{c().missing}</p>}>
            <ProjectDetail
              project={current()!}
              language={props.language}
              vault={props.vault}
              busy={busy()}
              onRun={run}
              onSave={save}
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
          </Show>
        </Show>
      </Show>
    </section>
  );
}
