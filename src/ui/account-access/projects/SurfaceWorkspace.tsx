import type { PendingAttachment } from '../../../platform/vault/project-store';
import { createMemo, createResource, createSignal, For, Show } from 'solid-js';
import type {
  SavedProject,
  Surface,
  RestorationObject,
  Attachment,
} from '../../../platform/projects/types';
import type { LocalVault } from '../../../platform/vault/vault';
import { updateSurfaceImages } from '../../../platform/projects/surface-attachments';
import type { PlanarSurface } from '../../../platform/projects/planar-types';
import { SurfaceMeasurements } from './SurfaceMeasurements';
import type { Language } from '../types';
import { CheckpointReview } from '../../editor/checkpoint-review/CheckpointReview';
import { checkpointCopy } from '../../editor/checkpoint-review/copy';
import { control as drawingControl } from '../../editor/drawing-review/constants';
import { drawingCopy } from '../../editor/drawing-review/copy';
import { SurfaceReviewAdapter } from './SurfaceReviewAdapter';
import { SurfaceDrawing } from './SurfaceDrawing';
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
  onSave: (project: SavedProject, attachment?: PendingAttachment) => Promise<void>;
  onNavigate: (href: string) => void;
}) {
  const c = () => projectCopy[props.language];
  const view = () => surfaceCopy[props.language];
  const draw = createMemo(() => drawingCopy(props.language));
  const [selected, setSelected] = createSignal<string>();
  const [mode, setMode] = createSignal<'photo' | 'drawing' | 'checkpoint'>('photo');
  const [checkpointStarted, setCheckpointStarted] = createSignal(false);
  const drawing = () => mode() === 'drawing';
  const imperial = () =>
    (props.surface.units ?? props.object.units ?? props.project.settings.units) === 'imperial';
  const [drawingStarted, setDrawingStarted] = createSignal(false);
  const images = () => props.surface.images;
  const index = () =>
    Math.max(
      0,
      images().findIndex((image) => image.id === selected()),
    );
  const photo = () => images()[index()];
  const reference = () => images().find((image) => image.role === 'mapping');
  const assessment = () =>
    props.surface.assessments?.find((entry) => entry.source.id === reference()?.id);
  const role = () =>
    photo()?.role === 'reference'
      ? 'reference'
      : photo()?.id === reference()?.id
        ? 'main'
        : 'detail';
  const reviewKey = createMemo(() => [photo()?.id, role(), reference()?.id].join('/'));
  const move = (offset: number) => setSelected(images()[index() + offset]?.id);
  const href = () => projectHref(props.project.id);
  const saveSurface = (changes: Partial<Surface>, attachment?: PendingAttachment) =>
    props.onSave(
      {
        ...props.project,
        objects: props.project.objects.map((object) =>
          object.id === props.object.id
            ? {
                ...object,
                surfaces: object.surfaces.map((surface) =>
                  surface.id === props.surface.id ? { ...surface, ...changes } : surface,
                ),
              }
            : object,
        ),
      },
      attachment,
    );
  const saveAssessment = (state: PlanarSurface) => {
    const assessments = props.surface.assessments ?? [];
    // Project commands here run as deferred event callbacks.
    // eslint-disable-next-line solid/reactivity
    return props.onRun(() =>
      saveSurface({
        assessments: [...assessments.filter((entry) => entry.source.id !== state.source.id), state],
      }),
    );
  };
  const saveImages = (images: Attachment[], attachment?: PendingAttachment) =>
    saveSurface(updateSurfaceImages(props.surface, images), attachment);
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
      <div class="surface-mode" role="group" aria-label={draw().mode}>
        <button
          class="secondary"
          type="button"
          data-control-id={drawingControl('mode.photo')}
          aria-pressed={mode() === 'photo'}
          onClick={() => setMode('photo')}
        >
          {draw().photoMode}
        </button>
        <button
          class="secondary"
          type="button"
          data-control-id={drawingControl('mode.drawing')}
          aria-pressed={drawing()}
          onClick={() => {
            setDrawingStarted(true);
            setMode('drawing');
          }}
        >
          {draw().drawingMode}
        </button>
        <button
          class="secondary"
          type="button"
          data-control-id="checkpoint.review.mode"
          aria-pressed={mode() === 'checkpoint'}
          onClick={() => {
            setCheckpointStarted(true);
            setMode('checkpoint');
          }}
        >
          {checkpointCopy[props.language].mode}
        </button>
      </div>
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
        <Show when={mode() !== 'checkpoint'}>
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
        </Show>
      </div>
      <div hidden={mode() !== 'photo'}>
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
              unit={imperial() ? 'in' : 'cm'}
              state={
                assessment() ??
                (!reference()
                  ? props.surface.assessments?.find((entry) => entry.source.id === photo()?.id)
                  : undefined)
              }
              busy={props.busy}
              onSave={saveAssessment}
            />
          )}
        </Show>
      </div>
      <Show when={drawingStarted()}>
        <Show when={reference()?.id ?? 'empty'} keyed>
          {(key) => (
            <SurfaceDrawing
              active={drawing()}
              copy={draw()}
              vault={props.vault}
              project={props.project.id}
              photo={photo()?.id}
              reference={key === 'empty' ? undefined : key}
              referenceOnly={role() === 'reference'}
              state={assessment()}
              view={view()}
              busy={props.busy}
              onSave={saveAssessment}
            />
          )}
        </Show>
      </Show>
      <Show when={checkpointStarted()}>
        <div hidden={mode() !== 'checkpoint'}>
          <CheckpointReview language={props.language} imperial={imperial()} />
        </div>
      </Show>
      <Show
        when={assessment() && mode() === 'photo' ? assessment() : undefined}
        fallback={
          <Show when={mode() === 'photo'}>
            <p role="status">{view().unavailable}</p>
          </Show>
        }
      >
        {(state) => (
          <SurfaceMeasurements
            state={state()}
            revision={props.project.revision}
            copy={view()}
            language={props.language}
            imperial={imperial()}
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
