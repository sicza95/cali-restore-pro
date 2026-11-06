import { createMemo, createResource, createSignal, For, Show } from 'solid-js';
import type {
  SavedProject,
  Surface,
  RestorationObject,
  Attachment,
} from '../../../platform/projects/types';
import type { LocalVault } from '../../../platform/vault/vault';
import type { Language } from '../types';
import { SurfaceReviewAdapter } from './SurfaceReviewAdapter';
import { surfaceCopy } from './surface-copy';
import './surface-styles.css';
import { ProjectOriginals } from './ProjectOriginals';
import { projectCopy } from './project-copy';
import { followProjectLink, projectHref } from './project-route';

export function SurfaceWorkspace(props: {
  project: SavedProject;
  object: RestorationObject;
  surface: Surface;
  vault: LocalVault;
  language: Language;
  busy: boolean;
  onRun: (task: () => Promise<void>) => Promise<boolean>;
  onSave: (project: SavedProject) => Promise<void>;
  onNavigate: (href: string) => void;
}) {
  const c = () => projectCopy[props.language];
  const view = () => surfaceCopy[props.language];
  const [selected, setSelected] = createSignal<string>();
  const images = () => props.surface.images;
  const index = () =>
    Math.max(
      0,
      images().findIndex((image) => image.id === selected()),
    );
  const photo = () => images()[index()];
  const reference = () => images().find((image) => image.role === 'mapping');
  const role = () =>
    photo()?.role === 'reference'
      ? 'reference'
      : photo()?.id === reference()?.id
        ? 'main'
        : 'detail';
  const reviewKey = createMemo(() => [photo()?.id, role(), reference()?.id].join('/'));
  const move = (offset: number) => setSelected(images()[index() + offset]?.id);
  const href = () => projectHref(props.project.id);
  const saveImages = (images: Attachment[]) =>
    props.onSave({
      ...props.project,
      objects: props.project.objects.map((object) =>
        object.id === props.object.id
          ? {
              ...object,
              surfaces: object.surfaces.map((surface) =>
                surface.id === props.surface.id ? { ...surface, images } : surface,
              ),
            }
          : object,
      ),
    });
  return (
    <>
      <a
        class="project-back"
        data-control-id="surface.project"
        href={href()}
        onClick={(event) => followProjectLink(event, props.onNavigate)}
      >
        {props.project.name}
      </a>
      <header class="surface-heading">
        <p>{props.object.name}</p>
        <h2>{props.surface.name}</h2>
      </header>
      <div class="surface-navigation">
        <label>
          {view().surface}
          <select
            data-control-id="surface.view.surface"
            value={props.surface.id}
            disabled={props.project.objects.flatMap((object) => object.surfaces).length < 2}
            onChange={(e) => props.onNavigate(projectHref(props.project.id, e.currentTarget.value))}
          >
            <For each={props.project.objects}>
              {(object) => (
                <optgroup label={object.name}>
                  <For each={object.surfaces}>
                    {(surface) => <option value={surface.id}>{surface.name}</option>}
                  </For>
                </optgroup>
              )}
            </For>
          </select>
        </label>
        <label>
          {view().photo}
          <select
            data-control-id="surface.view.photo"
            value={photo()?.id ?? ''}
            disabled={!photo()}
            onChange={(e) => setSelected(e.currentTarget.value)}
          >
            <Show when={!photo()}>
              <option value="">—</option>
            </Show>
            <For each={images()}>
              {(image, i) => {
                const [meta] = createResource(() =>
                  props.vault
                    .files()
                    .metadata({ project: props.project.id, id: image.id })
                    .catch(() => undefined),
                );
                return (
                  <option value={image.id}>
                    {i() + 1} · {meta()?.name ?? '—'}
                  </option>
                );
              }}
            </For>
          </select>
        </label>
        <button
          type="button"
          class="secondary"
          data-control-id="surface.view.previous"
          disabled={index() === 0}
          onClick={() => move(-1)}
        >
          {view().previous}
        </button>
        <button
          type="button"
          class="secondary"
          data-control-id="surface.view.next"
          disabled={index() + 1 >= images().length}
          onClick={() => move(1)}
        >
          {view().next}
        </button>
      </div>
      <Show when={photo()}>
        <p>
          {index() + 1} / {images().length} · {view()[role()]}
        </p>
      </Show>
      <Show when={reviewKey()} keyed>
        {(key) => (
          <SurfaceReviewAdapter
            vault={props.vault}
            project={props.project.id}
            photo={key.split('/')[0] || undefined}
            role={role()}
            reference={reference()?.id}
            copy={view()}
            unit={
              (props.surface.units ?? props.object.units ?? props.project.settings.units) ===
              'imperial'
                ? 'in'
                : 'cm'
            }
          />
        )}
      </Show>
      <ProjectOriginals
        project={props.project.id}
        surface={props.surface}
        copy={c()}
        vault={props.vault}
        busy={props.busy}
        onRun={props.onRun}
        onSave={saveImages}
      />
    </>
  );
}
