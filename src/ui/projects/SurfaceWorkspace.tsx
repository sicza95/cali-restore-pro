import type { JournalWrite, PendingAttachment } from '../../platform/vault/project-store';
import { createMemo, createResource, createSignal, For, Show } from 'solid-js';
import type {
  SavedProject,
  Surface,
  RestorationObject,
  Attachment,
} from '../../platform/projects/types';
import type { LocalVault } from '../../platform/vault/vault';
import { updateSurfaceImages } from '../../platform/projects/surface-attachments';
import type { PlanarSurface } from '../../platform/projects/planar-types';
import { SurfaceMeasurements } from './SurfaceMeasurements';
import type { Language } from '../account-access/types';
import { createSurfaceJournal } from './createSurfaceJournal';
import { photoHistory, recordHistory } from '../../platform/projects/surface-journal';
import { SurfaceCheckpoints } from './SurfaceCheckpoints';
import { checkpointCopy } from '../editor/checkpoint-review/copy';
import { control as drawingControl } from '../editor/drawing-review/constants';
import { drawingCopy } from '../editor/drawing-review/copy';
import { SurfaceReviewAdapter } from './SurfaceReviewAdapter';
import { SurfaceDrawing } from './SurfaceDrawing';
import { SurfaceRecoveryNotice } from './SurfaceRecoveryNotice';
import { Icon } from '../icon/Icon';
import { surfaceCopy } from './surface-copy';
import './surface-styles.css';
import { ProjectOriginals } from './ProjectOriginals';
import { projectCopy } from './project-copy';
import { projectHref } from '../router/routes';

export function SurfaceWorkspace(props: {
  project: SavedProject;
  object: RestorationObject;
  surface: Surface;
  vault: LocalVault;
  language: Language;
  busy: boolean;
  onRun: (task: () => Promise<void>) => Promise<boolean>;
  onSave: (
    project: SavedProject,
    attachment?: PendingAttachment,
    journal?: JournalWrite,
  ) => Promise<void>;
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
  const saveSurface = (
    changes: Partial<Surface>,
    attachment?: PendingAttachment,
    journal?: JournalWrite,
  ) =>
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
      journal,
    );
  const withAssessment = (state: PlanarSurface) => ({
    assessments: [
      ...(props.surface.assessments ?? []).filter((entry) => entry.source.id !== state.source.id),
      state,
    ],
  });
  const recovery = createSurfaceJournal({
    vault: () => props.vault,
    ref: (source) => ({ project: props.project.id, surface: props.surface.id, source }),
    source: () => reference()?.id,
    assessment,
    projectRevision: () => props.project.revision,
    run: (task) => props.onRun(task),
    saveAssessment: (state, write) => saveSurface(withAssessment(state), undefined, write),
  });
  // Project commands execute from user events under the shared save guard.
  const savePhoto = (state: PlanarSurface, previous: PlanarSurface) => {
    if (state === previous) return Promise.resolve(true);
    if (!reference()) return props.onRun(() => saveSurface(withAssessment(state)));
    const journal = recovery.journal();
    if (!journal || journal.conflict) return Promise.resolve(false);
    return recovery.save(recordHistory(journal, photoHistory(previous, state)), state);
  };
  const saveCheckpoints: Parameters<typeof SurfaceCheckpoints>[0]['create'] = (checkpoints) =>
    props.onRun(() => saveSurface({ checkpoints }));
  const restoreCheckpoint: Parameters<typeof SurfaceCheckpoints>[0]['restore'] = (
    state,
    checkpoints,
  ) =>
    recovery.save(
      recordHistory(recovery.journal()!, {
        action: 'checkpointChange',
        checkpoint: { before: assessment()!, after: state },
      }),
      state,
      // eslint-disable-next-line solid/reactivity -- recovery.save calls this once the journal is written, during the user's command.
      (next, write) => saveSurface({ ...withAssessment(next), checkpoints }, undefined, write),
    );
  const saveImages = (images: Attachment[], attachment?: PendingAttachment) =>
    saveSurface(updateSurfaceImages(props.surface, images), attachment);
  // Photo setup and drawing: one compact picker row, so the canvas starts near the top.
  const compact = () => mode() !== 'checkpoint';
  return (
    <>
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
      {/* Every mode is paused until this is resolved, so it sits above them all (#38). */}
      <Show when={reference() && (recovery.failed() || recovery.journal()?.conflict)}>
        <SurfaceRecoveryNotice
          failed={recovery.failed()}
          copy={draw()}
          busy={props.busy}
          onRetry={recovery.refetch}
          onDiscard={recovery.discardConflict}
        />
      </Show>
      <div class="surface-navigation" data-compact={compact() || undefined}>
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
                    {(surface) => (
                      // `selected` as well as the select's `value`: the value effect can run
                      // before these options exist, which left the first surface shown.
                      <option value={surface.id} selected={surface.id === props.surface.id}>
                        {surface.name}
                      </option>
                    )}
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
            title={compact() ? view().previous : undefined}
            onClick={() => move(-1)}
          >
            <Show when={compact()} fallback={view().previous}>
              <Icon name="chevron" class="surface-step-previous" />
              <span class="account-visually-hidden">{view().previous}</span>
            </Show>
          </button>
          <button
            type="button"
            class="secondary"
            data-control-id="surface.view.next"
            disabled={index() + 1 >= images().length}
            title={compact() ? view().next : undefined}
            onClick={() => move(1)}
          >
            <Show when={compact()} fallback={view().next}>
              <Icon name="chevron" class="surface-step-next" />
              <span class="account-visually-hidden">{view().next}</span>
            </Show>
          </button>
          <Show when={mode() === 'photo' && photo()}>
            <span class="surface-photo-count">
              {index() + 1} / {images().length} · {view()[role()]}
            </span>
          </Show>
        </Show>
      </div>
      <div hidden={mode() !== 'photo'}>
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
              busy={
                props.busy ||
                (!!reference() && (!recovery.journal() || !!recovery.journal()?.conflict))
              }
              onSave={savePhoto}
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
              language={props.language}
              vault={props.vault}
              project={props.project.id}
              photo={photo()?.id}
              reference={key === 'empty' ? undefined : key}
              referenceOnly={role() === 'reference'}
              state={assessment()}
              view={view()}
              busy={props.busy}
              journal={recovery.journal()}
              onSave={recovery.save}
            />
          )}
        </Show>
      </Show>
      <Show when={checkpointStarted()}>
        <div hidden={mode() !== 'checkpoint'}>
          <SurfaceCheckpoints
            language={props.language}
            imperial={imperial()}
            vault={props.vault}
            project={props.project.id}
            state={assessment()}
            checkpoints={props.surface.checkpoints ?? []}
            busy={props.busy || !recovery.journal() || !!recovery.journal()?.conflict}
            restoreBlocked={!!recovery.journal()?.drafts.length}
            create={saveCheckpoints}
            restore={restoreCheckpoint}
          />
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
        language={props.language}
        project={props.project.id}
        surface={props.surface}
        copy={c()}
        vault={props.vault}
        busy={props.busy}
        pendingSource={recovery.journal()?.drafts.length ? reference()?.id : undefined}
        onRun={props.onRun}
        onSave={saveImages}
      />
    </>
  );
}
