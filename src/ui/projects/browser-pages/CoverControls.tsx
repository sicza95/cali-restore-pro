import { createMemo, createSignal, For, onCleanup, Show, untrack } from 'solid-js';
import { preserveLegacyProjectSettings } from '../../../platform/projects/settings';
import { browserMutations } from '../../../platform/projects/browser/mutations';
import type { Surface } from '../../../platform/projects/types';
import { useApp } from '../../app-context/AppContext';
import { pageCopy } from './copy';
import type { InspectedEntity, Workspace } from './types';

/** Every attached photo of the entity's subtree, labelled by its surface. */
function photos(entity: InspectedEntity['entity']) {
  const surfaces: Surface[] =
    'objects' in entity
      ? entity.objects.flatMap(({ surfaces }) => surfaces)
      : 'surfaces' in entity
        ? entity.surfaces
        : [entity];
  const seen = new Set<string>();
  return surfaces.flatMap((surface) =>
    surface.images
      .filter(({ id }) => !seen.has(id) && seen.add(id))
      .map(({ id }, index) => ({ id, surface: surface.name, index: index + 1 })),
  );
}

/** Choose a subtree photo or upload a dedicated image as the cover; reset returns to the deck. */
export function CoverControls(props: { ws: Workspace; inspected: InspectedEntity }) {
  const app = useApp();
  const c = () => pageCopy[props.ws.language];
  const mutations = browserMutations(
    untrack(() => props.ws.vault),
    app.account()?.id ?? null,
  );
  const choices = createMemo(() => photos(props.inspected.entity));
  const [choice, setChoice] = createSignal('');
  const [failed, setFailed] = createSignal(false);
  const [upload, setUpload] = createSignal<AbortController>();
  // A styled button opens the hidden native picker, whose own text is never translated.
  let picker: HTMLInputElement | undefined;
  onCleanup(() => upload()?.abort());
  const key = () => props.inspected.target.kind + '-' + props.inspected.entity.id;
  const current = () => props.inspected.entity.cover?.assetId;
  function change(task: () => Promise<void>) {
    setFailed(false);
    void props.ws
      .run(async () => {
        try {
          await task();
        } catch (error) {
          setFailed(true);
          throw error;
        }
      })
      .then(() => props.ws.sync.refresh());
  }
  const project = () => preserveLegacyProjectSettings(props.inspected.project);
  return (
    <div class="project-cover">
      <p>{c().coverHelp}</p>
      <Show when={choices().length} fallback={<p>{c().coverNoPhotos}</p>}>
        <label>
          {c().coverPhoto}
          <select
            data-control-id="browser.cover.photo"
            value={choice() || current() || ''}
            onChange={(event) => setChoice(event.currentTarget.value)}
          >
            <option value="">{c().coverNone}</option>
            <For each={choices()}>
              {(photo) => (
                <option value={photo.id}>{c().photoNumber(photo.surface, photo.index)}</option>
              )}
            </For>
          </select>
        </label>
        <button
          type="button"
          data-control-id="browser.cover.use"
          disabled={
            props.ws.busy() || !(choice() || current()) || (choice() || current()) === current()
          }
          onClick={() =>
            change(async () =>
              props.ws.update(
                await mutations.setCover(project(), props.inspected.target, choice() || current()!),
              ),
            )
          }
        >
          {c().coverUse}
        </button>
      </Show>
      <input
        ref={(element) => (picker = element)}
        id={'cover-' + key()}
        hidden
        type="file"
        accept="image/*"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = '';
          if (!file) return;
          const controller = new AbortController();
          setUpload(controller);
          change(async () => {
            try {
              props.ws.update(
                await mutations.uploadCover(
                  project(),
                  props.inspected.target,
                  file,
                  controller.signal,
                ),
              );
            } finally {
              setUpload(undefined);
            }
          });
        }}
      />
      <button
        type="button"
        data-control-id="browser.cover.upload"
        disabled={props.ws.busy() || !!upload()}
        onClick={() => picker?.click()}
      >
        {upload() ? c().uploading : c().coverUpload}
      </button>
      <Show when={current()}>
        <button
          type="button"
          data-control-id="browser.cover.reset"
          disabled={props.ws.busy()}
          onClick={() => {
            setChoice('');
            change(async () =>
              props.ws.update(await mutations.setCover(project(), props.inspected.target, null)),
            );
          }}
        >
          {c().coverReset}
        </button>
      </Show>
      <Show when={failed()}>
        <p role="alert">{c().coverFailed}</p>
      </Show>
    </div>
  );
}
