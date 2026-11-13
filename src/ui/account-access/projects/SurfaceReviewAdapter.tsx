import { createSignal, For, Show, untrack } from 'solid-js';
import type { LocalVault } from '../../../platform/vault/vault';
import type { SurfaceCopy } from './surface-copy';
import { SurfacePanControls } from './SurfacePanControls';
import { SurfacePhoto } from './SurfacePhoto';
import { GuideFields, SurfaceReviewGuides } from './SurfaceReviewGuides';
import { fields, toolFields, tools } from './surface-review-controls';
import type { ReviewTool } from './surface-review-controls';
import { defaults, surfacePhotoStyle, validateDraft } from './surface-review-model';
const id = (key: string) => 'surface.review.' + key;

export function SurfaceReviewAdapter(props: {
  vault: LocalVault;
  project: string;
  photo?: string;
  reference?: string;
  copy: SurfaceCopy;
  role?: 'main' | 'detail' | 'reference';
  unit: 'cm' | 'in';
}) {
  const [size, setSize] = createSignal<{ width: number; height: number }>();
  const [tool, setTool] = createSignal<ReviewTool>();
  const [draft, setDraft] = createSignal(untrack(() => defaults(props.unit)));
  const [applied, setApplied] = createSignal<
    Partial<Record<ReviewTool, ReturnType<typeof defaults>>>
  >({});
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
    setDraft(applied()[key] ?? defaults(props.unit));
    setNotice(undefined);
    setOriginal(false);
    setCompare(false);
    setTool(key);
  }
  function close() {
    const key = tool();
    setTool(undefined);
    if (key) toolButtons[key]?.focus();
    setOriginal(false);
    setCompare(false);
  }
  const valid = () => !!tool() && validateDraft(tool()!, draft(), size());
  const preview = () => (tool() && valid() ? { ...applied(), [tool()!]: draft() } : applied());
  const lines = () => {
    const state = preview().calibrate;
    return !original() && state?.method === 'lines' ? state : undefined;
  };
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
                  original() ? undefined : preview(),
                )}
                zoom={zoom()}
                onReady={setSize}
              >
                <SurfaceReviewGuides
                  lines={lines()}
                  pairs={pairs()}
                  rectification={original() ? undefined : preview().prepare}
                  usable={
                    !original() && !compare() && !preview().align?.referenceOnly
                      ? preview().align?.usable
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
        <p role="status">{notice() ? props.copy.applied : props.copy.uncalibrated}</p>
        <For each={tools}>
          {(key) => (
            <Show when={unavailable(key)}>
              <span class="surface-reason" id={id(key) + '-reason'}>
                {props.copy[key]} · {unavailable(key)}
              </span>
            </Show>
          )}
        </For>
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
                <button
                  class="secondary"
                  disabled
                  data-control-id={id('auto')}
                  aria-describedby="surface-auto-help"
                >
                  {props.copy.auto}
                </button>
                <p id="surface-auto-help">{props.copy.autoUnavailable}</p>
                <label>
                  <input
                    data-control-id={id('compare')}
                    type="checkbox"
                    checked={compare()}
                    onChange={(e) => setCompare(e.currentTarget.checked)}
                  />
                  {props.copy.compare}
                </label>
                <label>
                  <input
                    data-control-id={id('referenceOnly')}
                    type="checkbox"
                    checked={draft().referenceOnly}
                    onChange={(e) =>
                      setDraft({ ...draft(), referenceOnly: e.currentTarget.checked })
                    }
                  />
                  {props.copy.referenceOnly}
                </label>
                <Show when={!draft().referenceOnly}>
                  <label>
                    <input
                      data-control-id={id('manualPairs')}
                      type="checkbox"
                      checked={draft().manualPairs}
                      aria-describedby="surface-pair-help"
                      onChange={(e) => {
                        const manualPairs = e.currentTarget.checked;
                        setDraft({ ...draft(), manualPairs });
                        if (manualPairs) setCompare(true);
                      }}
                    />
                    {props.copy.manualPairs}
                  </label>
                  <p id="surface-pair-help">{props.copy.pairHelp}</p>
                  <Show when={draft().manualPairs}>
                    <GuideFields copy={props.copy} draft={draft()} change={setDraft} pairs />
                  </Show>
                </Show>
              </Show>
              <Show when={key === 'calibrate'}>
                <label>
                  {props.copy.method}
                  <select
                    data-control-id={id('method')}
                    value={draft().method}
                    onChange={(e) => setDraft({ ...draft(), method: e.currentTarget.value })}
                  >
                    <option value="dimensions">{props.copy.dimensions}</option>
                    <option value="lines">{props.copy.lines}</option>
                  </select>
                </label>
                <Show when={draft().method === 'lines'}>
                  <p>{props.copy.lineHelp}</p>
                  <GuideFields copy={props.copy} draft={draft()} change={setDraft} />
                </Show>
                <label>
                  {props.copy.unit}
                  <select
                    data-control-id={id('unit')}
                    value={draft().unit}
                    onChange={(e) => setDraft({ ...draft(), unit: e.currentTarget.value })}
                  >
                    <option value="mm">mm</option>
                    <option value="cm">cm</option>
                    <option value="m">m</option>
                    <option value="in">in</option>
                    <option value="ft">ft</option>
                  </select>
                </label>
              </Show>
              <div class="surface-fields">
                <For each={key === 'align' && draft().referenceOnly ? [] : toolFields[key]}>
                  {(field) => (
                    <label>
                      {props.copy[field]}{' '}
                      <small>
                        {fields[field][0]}–{fields[field][1]}
                      </small>
                      <input
                        type="number"
                        step="any"
                        min={fields[field][0]}
                        max={fields[field][1]}
                        required
                        value={draft()[field]}
                        data-control-id={id(field)}
                        aria-describedby={!valid() ? 'surface-review-invalid' : undefined}
                        onInput={(e) => setDraft({ ...draft(), [field]: e.currentTarget.value })}
                      />
                    </label>
                  )}
                </For>
              </div>
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
                <p id="surface-review-invalid">{props.copy.invalid}</p>
              </Show>
              <div class="surface-actions">
                <button
                  type="button"
                  data-control-id={id('apply')}
                  disabled={!valid()}
                  onClick={() => {
                    if (valid()) {
                      setApplied({ ...applied(), [key]: draft() });
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
                  onClick={() => setDraft(defaults(props.unit))}
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
