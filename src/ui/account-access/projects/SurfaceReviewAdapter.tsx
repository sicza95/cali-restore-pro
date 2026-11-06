import { createSignal, For, Show, untrack } from 'solid-js';
import type { LocalVault } from '../../../platform/vault/vault';
import type { SurfaceCopy } from './surface-copy';
import { SurfacePhoto } from './SurfacePhoto';
import { fields, toolFields, tools } from './surface-review-controls';
import type { ReviewTool } from './surface-review-controls';

const defaults = (unit: string) => ({
  cropX: '0',
  cropY: '0',
  cropWidth: '100',
  cropHeight: '100',
  rotation: '0',
  skew: '0',
  offsetX: '0',
  offsetY: '0',
  usable: '100',
  width: '',
  height: '',
  flip: false,
  aspect: 'free',
  method: 'dimensions',
  referenceOnly: false,
  unit,
});
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
  const c = () => props.copy;
  const toolButtons: Partial<Record<ReviewTool, HTMLButtonElement>> = {};
  const unavailable = (key: ReviewTool) => {
    if (!size()) return props.photo ? c().previewUnavailable : c().empty;
    if (key === 'align' && (props.role === 'main' || !props.reference))
      return c().alignmentUnavailable;
    if (key === 'calibrate' && props.role !== 'main') return c().calibrationUnavailable;
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
  const valid = () => {
    const key = tool();
    if (!key) return false;
    const d = draft();
    const dimensions = size();
    return (
      toolFields[key].every((field) => {
        const [min, max] = fields[field];
        const value = Number(d[field]);
        return d[field].trim() && value >= min && value <= max;
      }) &&
      (key !== 'prepare' ||
        (Number(d.cropX) + Number(d.cropWidth) <= 100 &&
          Number(d.cropY) + Number(d.cropHeight) <= 100 &&
          (d.aspect !== 'square' ||
            !dimensions ||
            Math.abs(
              Number(d.cropWidth) * dimensions.width - Number(d.cropHeight) * dimensions.height,
            ) <= 100)))
    );
  };
  const preview = () => (tool() && valid() ? { ...applied(), [tool()!]: draft() } : applied());
  const photoStyle = () => {
    const p = original() ? undefined : preview().prepare;
    const a = original() ? undefined : preview().align;
    return {
      transform: `scale(${zoom() / 100}) rotate(${rotate() + Number(p?.rotation ?? 0)}deg) skewX(${p?.skew ?? 0}deg) scaleX(${p?.flip ? -1 : 1}) translate(${a?.referenceOnly ? 0 : (a?.offsetX ?? 0)}%, ${a?.referenceOnly ? 0 : (a?.offsetY ?? 0)}%)`,
      'clip-path': p
        ? `inset(${p.cropY}% ${100 - Number(p.cropX) - Number(p.cropWidth)}% ${100 - Number(p.cropY) - Number(p.cropHeight)}% ${p.cropX}%)`
        : undefined,
    };
  };
  return (
    <div class="surface-review" classList={{ 'surface-focus': focus() }}>
      <div class="surface-rail" role="group" aria-label={c().tools}>
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
              {c()[key]}
            </button>
          )}
        </For>
      </div>
      <section class="surface-stage" aria-label={c().photo}>
        <div class="surface-canvas" classList={{ 'surface-compare': compare() }}>
          <Show when={props.photo} fallback={<p>{c().empty}</p>}>
            {(photo) => (
              <SurfacePhoto
                vault={props.vault}
                project={props.project}
                id={photo()}
                copy={c()}
                style={photoStyle()}
                onReady={setSize}
              />
            )}
          </Show>
          <Show when={compare() && props.reference}>
            {(reference) => (
              <SurfacePhoto
                vault={props.vault}
                project={props.project}
                id={reference()}
                copy={{ ...c(), photo: c().main }}
              />
            )}
          </Show>
          <Show
            when={!original() && !compare() && preview().align && !preview().align?.referenceOnly}
          >
            <div
              class="surface-usable"
              aria-hidden="true"
              style={{ inset: (100 - Math.sqrt(Number(preview().align?.usable) * 100)) / 2 + '%' }}
            />
          </Show>
          <Show when={size() && tool() === 'calibrate' && draft().method === 'lines'}>
            <div class="surface-guides" aria-hidden="true">
              <span />
              <span />
            </div>
          </Show>
        </div>
        <div class="surface-actions">
          <label>
            {c().zoom}
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
            }}
          >
            {c().fit}
          </button>
          <button
            type="button"
            class="secondary"
            data-control-id="surface.view.rotate"
            disabled={!size()}
            onClick={() => setRotate((value) => (value + 90) % 360)}
          >
            {c().rotate}
          </button>
          <button
            type="button"
            class="secondary"
            data-control-id="surface.view.focus"
            aria-pressed={focus()}
            onClick={() => setFocus(!focus())}
          >
            {c().focus}
          </button>
        </div>
      </section>
      <section class="surface-inspector" aria-label={c().tools}>
        <p class="surface-transient">{c().transient}</p>
        <p role="status">{notice() ? c().applied : c().uncalibrated}</p>
        <For each={tools}>
          {(key) => (
            <Show when={unavailable(key)}>
              <span class="surface-reason" id={id(key) + '-reason'}>
                {c()[key]} · {unavailable(key)}
              </span>
            </Show>
          )}
        </For>
        <Show when={tool()} keyed fallback={<p>{c().initial}</p>}>
          {(key) => (
            <>
              <h3>{c()[key]}</h3>
              <Show when={key === 'prepare'}>
                <label>
                  {c().aspect}
                  <select
                    data-control-id={id('aspect')}
                    value={draft().aspect}
                    onChange={(e) => setDraft({ ...draft(), aspect: e.currentTarget.value })}
                  >
                    <option value="free">{c().free}</option>
                    <option value="square">{c().square}</option>
                  </select>
                </label>
                <label>
                  <input
                    data-control-id={id('flip')}
                    type="checkbox"
                    checked={draft().flip}
                    onChange={(e) => setDraft({ ...draft(), flip: e.currentTarget.checked })}
                  />
                  {c().flip}
                </label>
              </Show>
              <Show when={key === 'align'}>
                <button
                  class="secondary"
                  disabled
                  data-control-id={id('auto')}
                  aria-describedby="surface-auto-help"
                >
                  {c().auto}
                </button>
                <p id="surface-auto-help">{c().autoUnavailable}</p>
                <label>
                  <input
                    data-control-id={id('compare')}
                    type="checkbox"
                    checked={compare()}
                    onChange={(e) => setCompare(e.currentTarget.checked)}
                  />
                  {c().compare}
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
                  {c().referenceOnly}
                </label>
              </Show>
              <Show when={key === 'calibrate'}>
                <label>
                  {c().method}
                  <select
                    data-control-id={id('method')}
                    value={draft().method}
                    onChange={(e) => setDraft({ ...draft(), method: e.currentTarget.value })}
                  >
                    <option value="dimensions">{c().dimensions}</option>
                    <option value="lines">{c().lines}</option>
                  </select>
                </label>
                <Show when={draft().method === 'lines'}>
                  <p>{c().lineHelp}</p>
                </Show>
                <label>
                  {c().unit}
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
                <For each={toolFields[key]}>
                  {(field) => (
                    <label>
                      {c()[field]}{' '}
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
                  {c().original}
                </label>
              </Show>
              <Show when={!valid()}>
                <p id="surface-review-invalid">{c().invalid}</p>
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
                  {c().apply}
                </button>
                <button
                  type="button"
                  class="secondary"
                  data-control-id={id('cancel')}
                  onClick={close}
                >
                  {c().cancel}
                </button>
                <button
                  type="button"
                  class="secondary"
                  data-control-id={id('reset')}
                  onClick={() => setDraft(defaults(props.unit))}
                >
                  {c().reset}
                </button>
              </div>
            </>
          )}
        </Show>
      </section>
    </div>
  );
}
