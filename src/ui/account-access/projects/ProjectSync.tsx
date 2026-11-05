/* eslint-disable solid/reactivity -- Commands read current project props when invoked. */
import { createSignal, For, Show } from 'solid-js';
import type { EditorSync } from '../../../platform/projects/editor-sync';
import type { Project, SavedProject } from '../../../platform/projects/types';
import type { Language } from '../types';
import type { useEditorSync } from './useEditorSync';
import { syncCopy } from './sync-copy';
import { projectCopy } from './project-copy';

export function ProjectSync(props: {
  projectId: string;
  project: SavedProject;
  language: Language;
  model: ReturnType<typeof useEditorSync>;
  busy: boolean;
  run: (task: () => Promise<void>) => Promise<boolean>;
  onResolved: (project: SavedProject) => void;
}) {
  const c = () => syncCopy[props.language];
  const [failed, setFailed] = createSignal(false);
  const [review, setReview] = createSignal<Awaited<ReturnType<EditorSync['review']>>>();
  const base = () =>
    props.model.state()?.checkpoints.find((row) => row.project === props.projectId);
  const draft = () => props.model.state()?.drafts.find((row) => row.project === props.projectId);
  const activeReview = () => {
    const value = review();
    return value?.id === draft()?.id && value?.local.revision === props.project.revision
      ? value
      : undefined;
  };
  function run(task: () => Promise<void>) {
    void props.run(async () => {
      setFailed(false);
      try {
        await task();
        await props.model.refresh();
      } catch {
        setFailed(true);
      }
    });
  }
  function resolve(value: NonNullable<ReturnType<typeof review>>, useRemote: boolean) {
    run(async () => {
      props.onResolved(await props.model.sync.resolve(value, props.project, useRemote));
      setReview(undefined);
    });
  }
  const status = () => {
    if (!base()) return c().disabled;
    if (draft()?.blocked) return c().conflict;
    if (props.model.errors().includes(props.project.id)) return c().staging;
    return draft() || props.project.revision > base()!.localRevision ? c().pending : c().saved;
  };
  return (
    <section class="project-pane project-sync" aria-label={c().title}>
      <h3>{c().title}</h3>
      <p role="status">{status()}</p>
      <Show when={failed() || props.model.unavailable()}>
        <p role="alert">{c().unavailable}</p>
      </Show>
      <Show when={props.model.state() && !base()}>
        <button
          class="secondary"
          disabled={props.busy}
          onClick={() => run(() => props.model.sync.enable(props.project.id))}
        >
          {c().enable}
        </button>
      </Show>
      <Show when={draft()?.blocked}>
        <button
          class="secondary"
          disabled={props.busy}
          onClick={() =>
            run(async () => {
              setReview(await props.model.sync.review(props.project));
            })
          }
        >
          {c().review}
        </button>
      </Show>
      <Show when={activeReview()} keyed>
        {(value) => (
          <>
            <div class="project-detail">
              <CopyPreview title={c().local} project={value.local} language={props.language} />
              <Show when={value.remote} fallback={<p>{c().noHead}</p>}>
                {(remote) => (
                  <CopyPreview title={c().cloud} project={remote()} language={props.language} />
                )}
              </Show>
            </div>
            <div class="project-fields">
              <button disabled={props.busy} onClick={() => resolve(value, false)}>
                {c().keepLocal}
              </button>
              <Show when={value.remote}>
                <button
                  class="secondary"
                  disabled={props.busy}
                  onClick={() => resolve(value, true)}
                >
                  {c().keepCloud}
                </button>
              </Show>
            </div>
          </>
        )}
      </Show>
    </section>
  );
}

function CopyPreview(props: { title: string; project: Project; language: Language }) {
  const c = () => projectCopy[props.language];
  return (
    <section aria-label={props.title} class="project-sync-copy">
      <h4>{props.title}</h4>
      <p>
        {props.project.name} · {props.project.settings.currency}
      </p>
      <p>
        {c()[props.project.settings.units]}
        <Show when={props.project.archived}> · {syncCopy[props.language].archived}</Show>
      </p>
      <ul>
        <For each={props.project.objects}>
          {(object) => (
            <li>
              {object.name} · {c()[object.units ?? 'inherit']}
              <ul>
                <For each={object.surfaces}>
                  {(surface) => (
                    <li>
                      {surface.name} · {c()[surface.units ?? 'inherit']}
                      <Show when={surface.images.length}>
                        <ul>
                          <For each={surface.images}>
                            {(image) => (
                              <li>
                                {c()[image.role]} · {image.id}
                              </li>
                            )}
                          </For>
                        </ul>
                      </Show>
                    </li>
                  )}
                </For>
              </ul>
            </li>
          )}
        </For>
      </ul>
    </section>
  );
}
