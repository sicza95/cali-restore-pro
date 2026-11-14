import { createMemo, createResource, createSignal, For, onCleanup, Show, untrack } from 'solid-js';
import { detailMapping } from '../../../platform/projects/planar-alignment';
import { photoFrame, sameSource } from '../../../platform/projects/planar-state';
import { preparationMatrix } from '../../../platform/projects/planar-transform';
import type { PlanarSurface, SourceFrame } from '../../../platform/projects/planar-types';
import { commitAssessment, preparation, savedDraft } from './surface-assessment';
import { surfaceMatcher } from './surface-match';
import type { LocalVault } from '../../../platform/vault/vault';
import type { SurfaceCopy } from './surface-copy';
import { SurfaceCalibrationFields } from './SurfaceCalibrationFields';
import { SurfaceAlignmentFields } from './SurfaceAlignmentFields';
import { SurfaceToolReasons } from './SurfaceToolReasons';
import { SurfacePanControls } from './SurfacePanControls';
import { SurfacePhoto } from './SurfacePhoto';
import { SurfaceReviewGuides } from './SurfaceReviewGuides';
import { tools } from './surface-review-controls';
import type { ReviewTool } from './surface-review-controls';
import { defaults, surfacePhotoStyle, validateDraft } from './surface-review-model';
import { SurfaceDraftFields } from './SurfaceDraftFields';
const id = (key: string) => 'surface.review.' + key;

export function SurfaceReviewAdapter(props: {
  vault: LocalVault;
  project: string;
  photo?: string;
  reference?: string;
  copy: SurfaceCopy;
  role?: 'main' | 'detail' | 'reference';
  unit: 'cm' | 'in';
  state?: PlanarSurface;
  busy: boolean;
  onSave: (state: PlanarSurface) => Promise<boolean>;
}) {
  const [size, setSize] = createSignal<SourceFrame>();
  const matcher = untrack(() => surfaceMatcher(props.vault, props.project));
  const controller = new AbortController();
  onCleanup(() => controller.abort());
  const [tool, setTool] = createSignal<ReviewTool>();
  const [draft, setDraft] = createSignal(untrack(() => defaults(props.unit)));
  const [automatic, setAutomatic] = createSignal(false);
  const [originalState] = createResource(
    () =>
      tool() && props.reference && props.reference !== props.photo && !props.state
        ? props.reference
        : undefined,
    async (id) => {
      const image = await props.vault
        .files()
        .workingImage({ project: props.project, id }, { signal: controller.signal })
        .catch(() => undefined);
      if (image)
        return { id, ...image.manifest.pixels, embeddedPreview: image.manifest.embeddedPreview };
    },
  );
  const referenceSource = () =>
    !props.reference || props.reference === props.photo
      ? size()
      : (props.state?.source ?? originalState());
  const [notice, setNotice] = createSignal<'applied'>();
  const [original, setOriginal] = createSignal(false);
  const [compare, setCompare] = createSignal(false);
  const [focus, setFocus] = createSignal(false);
  const [zoom, setZoom] = createSignal(100);
  const [rotate, setRotate] = createSignal(0);
  const [pan, setPan] = createSignal({ x: 0, y: 0 });
  const panLimit = () => (96 * zoom()) / 100;
  const boundPan = (value: number) => Math.max(-panLimit(), Math.min(panLimit(), value));
  const toolButtons: Partial<Record<ReviewTool, HTMLButtonElement>> = {};
  const unavailable = (key: ReviewTool) => {
    if (!size()) return props.photo ? props.copy.previewUnavailable : props.copy.empty;
    if (key === 'align' && (props.role !== 'detail' || !props.reference))
      return props.copy.alignmentUnavailable;
    if (key === 'calibrate' && props.role !== 'main') return props.copy.calibrationUnavailable;
    return '';
  };
  function select(key: ReviewTool) {
    matcher.cancel();
    setDraft(savedDraft(props.state, size(), key, props.unit));
    setAutomatic(
      props.state?.alignments.find((item) => item.source.id === props.photo)?.input.method ===
        'automatic',
    );
    setNotice(undefined);
    setOriginal(false);
    setCompare(false);
    setTool(key);
  }
  function close() {
    const key = tool();
    matcher.cancel();
    setTool(undefined);
    if (key) toolButtons[key]?.focus();
    setOriginal(false);
    setCompare(false);
  }
  const candidate = createMemo(() => {
    const key = tool();
    const source = size();
    const reference = referenceSource();
    if (!key || !source || !reference || !validateDraft(key, draft(), source)) return;
    try {
      return commitAssessment(props.state, reference, source, key, draft(), automatic());
    } catch {
      return;
    }
  });
  const valid = () => !!candidate();
  const preview = (key: ReviewTool) =>
    tool() === key && valid() ? draft() : savedDraft(props.state, size(), key, props.unit);
  const matrix = () => {
    const source = size();
    if (!source || original()) return;
    const state = candidate() ?? props.state;
    const local = preparationMatrix(source, preparation(source, preview('prepare')));
    if (!state || compare()) return local;
    const alignment = state.alignments.find((item) => sameSource(item.source, source));
    const detail =
      state.details.find((item) => sameSource(item.source, source)) ?? photoFrame(source);
    if (alignment && alignment.preparationRevision === detail.revision)
      return detailMapping(state, alignment, detail) ?? local;
    return local;
  };
  const lines = () =>
    !original() && props.role === 'main' && preview('calibrate').method === 'lines'
      ? preview('calibrate')
      : undefined;
  const pairs = () =>
    !original() && tool() === 'align' && draft().manualPairs && !draft().referenceOnly && valid()
      ? draft()
      : undefined;
  return (
    <div class="surface-review" classList={{ 'surface-focus': focus() }}>
      <div class="surface-rail" role="group" aria-label={props.copy.tools}>
        <For each={tools}>
          {(key) => (
            <button
              type="button"
              class="secondary"
              data-control-id={id(key)}
              ref={(element) => {
                toolButtons[key] = element;
              }}
              aria-pressed={tool() === key}
              aria-disabled={!!unavailable(key)}
              aria-describedby={unavailable(key) ? id(key) + '-reason' : undefined}
              onClick={() => {
                if (!unavailable(key)) select(key);
              }}
            >
              {props.copy[key]}
            </button>
          )}
        </For>
      </div>
      <section class="surface-stage" aria-label={props.copy.photo}>
        <div class="surface-canvas" classList={{ 'surface-compare': compare() }}>
          <Show when={props.photo} fallback={<p>{props.copy.empty}</p>}>
            {(photo) => (
              <SurfacePhoto
                vault={props.vault}
                project={props.project}
                id={photo()}
                copy={props.copy}
                style={surfacePhotoStyle(
                  { ...pan(), zoom: zoom(), rotate: rotate() },
                  original() ? undefined : preview('prepare'),
                )}
                zoom={zoom()}
                matrix={matrix()}
                onManifest={(manifest) =>
                  setSize({
                    id: photo(),
                    ...manifest.pixels,
                    embeddedPreview: manifest.embeddedPreview,
                  })
                }
              >
                <SurfaceReviewGuides
                  lines={lines()}
                  pairs={pairs()}
                  rectification={original() ? undefined : preview('prepare')}
                  usable={
                    !original() &&
                    !compare() &&
                    !preview('align').referenceOnly &&
                    (tool() === 'align' ||
                      props.state?.alignments.some((item) => item.source.id === props.photo))
                      ? preview('align').usable
                      : undefined
                  }
                />
              </SurfacePhoto>
            )}
          </Show>
          <Show when={compare() && props.reference}>
            {(reference) => (
              <SurfacePhoto
                vault={props.vault}
                project={props.project}
                id={reference()}
                copy={{ ...props.copy, photo: props.copy.main }}
              >
                <SurfaceReviewGuides pairs={pairs()} reference />
              </SurfacePhoto>
            )}
          </Show>
        </div>
        <div class="surface-actions">
          <label>
            {props.copy.zoom}
            <input
              data-control-id="surface.view.zoom"
              type="range"
              min="50"
              max="250"
              value={zoom()}
              disabled={!size()}
              onInput={(e) => setZoom(e.currentTarget.valueAsNumber)}
            />
          </label>
          <button
            type="button"
            class="secondary"
            data-control-id="surface.view.fit"
            disabled={!size()}
            onClick={() => {
              setZoom(100);
              setRotate(0);
              setPan({ x: 0, y: 0 });
            }}
          >
            {props.copy.fit}
          </button>
          <button
            type="button"
            class="secondary"
            data-control-id="surface.view.rotate"
            disabled={!size()}
            onClick={() => setRotate((value) => (value + 90) % 360)}
          >
            {props.copy.rotate}
          </button>
          <button
            type="button"
            class="secondary"
            data-control-id="surface.view.focus"
            aria-pressed={focus()}
            onClick={() => setFocus(!focus())}
          >
            {props.copy.focus}
          </button>
        </div>
        <SurfacePanControls
          copy={props.copy}
          disabled={!size()}
          move={(dx, dy) => setPan(({ x, y }) => ({ x: boundPan(x + dx), y: boundPan(y + dy) }))}
        />
      </section>
      <section
        class="surface-inspector"
        aria-label={props.copy.tools}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && tool()) {
            event.preventDefault();
            close();
          }
        }}
      >
        <p class="surface-transient">{props.copy.transient}</p>
        <Show when={notice()}>
          <p role="status">{props.copy.applied}</p>
        </Show>
        <SurfaceToolReasons reason={unavailable} copy={props.copy} />
        <Show when={tool()} keyed fallback={<p>{props.copy.initial}</p>}>
          {(key) => (
            <>
              <h3>{props.copy[key]}</h3>
              <Show when={key === 'prepare'}>
                <label>
                  {props.copy.aspect}
                  <select
                    data-control-id={id('aspect')}
                    value={draft().aspect}
                    onChange={(e) => setDraft({ ...draft(), aspect: e.currentTarget.value })}
                  >
                    <option value="free">{props.copy.free}</option>
                    <option value="square">{props.copy.square}</option>
                  </select>
                </label>
                <label>
                  <input
                    data-control-id={id('flip')}
                    type="checkbox"
                    checked={draft().flip}
                    onChange={(e) => setDraft({ ...draft(), flip: e.currentTarget.checked })}
                  />
                  {props.copy.flip}
                </label>
                <label>
                  <input
                    data-control-id={id('rectify')}
                    type="checkbox"
                    checked={draft().rectify}
                    aria-describedby="surface-rectify-help"
                    onChange={(e) => setDraft({ ...draft(), rectify: e.currentTarget.checked })}
                  />
                  {props.copy.rectify}
                </label>
                <p id="surface-rectify-help">{props.copy.rectifyHelp}</p>
              </Show>
              <Show when={key === 'align'}>
                <SurfaceAlignmentFields
                  matcher={matcher}
                  copy={props.copy}
                  photo={props.photo}
                  reference={props.reference}
                  busy={props.busy}
                  draft={draft()}
                  compare={compare()}
                  setDraft={setDraft}
                  setCompare={setCompare}
                  setAutomatic={setAutomatic}
                />
              </Show>
              <Show when={key === 'calibrate'}>
                <SurfaceCalibrationFields copy={props.copy} draft={draft()} setDraft={setDraft} />
              </Show>
              <SurfaceDraftFields
                tool={key}
                copy={props.copy}
                draft={draft()}
                valid={valid()}
                setDraft={setDraft}
              />
              <Show when={key !== 'calibrate'}>
                <label>
                  <input
                    data-control-id={id('original')}
                    type="checkbox"
                    checked={original()}
                    onChange={(e) => setOriginal(e.currentTarget.checked)}
                  />
                  {props.copy.original}
                </label>
              </Show>
              <Show when={!valid()}>
                <p id="surface-review-invalid">{props.copy.invalidFields}</p>
              </Show>
              <div class="surface-actions">
                <button
                  type="button"
                  data-control-id={id('apply')}
                  disabled={!valid() || props.busy || matcher.status() === 'matching'}
                  onClick={async () => {
                    const next = candidate();
                    if (next && (await props.onSave(next))) {
                      setNotice('applied');
                      close();
                    }
                  }}
                >
                  {props.copy.apply}
                </button>
                <button
                  type="button"
                  class="secondary"
                  data-control-id={id('cancel')}
                  onClick={close}
                >
                  {props.copy.cancel}
                </button>
                <button
                  type="button"
                  class="secondary"
                  data-control-id={id('reset')}
                  onClick={() => {
                    setAutomatic(false);
                    setDraft(defaults(props.unit));
                  }}
                >
                  {props.copy.reset}
                </button>
              </div>
            </>
          )}
        </Show>
      </section>
    </div>
  );
}
