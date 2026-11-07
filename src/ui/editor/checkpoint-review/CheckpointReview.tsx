import { createSignal, For, Show } from 'solid-js';
import type { Language } from '../../account-access/types';
import { checkpointCopy } from './copy';
import { checkpointFixtures, fixtureIds, measurementStates } from './fixtures';
import type { FixtureId, MeasurementState } from './fixtures';
import { PatternReview } from './PatternReview';
import './styles.css';

type Checkpoint = { id: string; name: string; fixture: FixtureId };
const control = (key: string) => 'checkpoint.review.' + key;
const units = { 'm²': 1, 'cm²': 10000, 'ft²': 10.7639104167 };
type Unit = keyof typeof units;

function SampleMap(props: { id: FixtureId; against?: FixtureId; zoom: number; label: string }) {
  const shape = () => checkpointFixtures[props.id];
  const other = () => props.against && checkpointFixtures[props.against];
  return (
    <svg viewBox="0 0 160 96" role="img" aria-label={props.label} class="checkpoint-map">
      <g transform={`translate(80 48) scale(${props.zoom / 100}) translate(-80 -48)`}>
        <rect x="10" y="9" width={1.4 * shape().crop} height="78" class="checkpoint-wall" />
        <rect
          x={shape().left}
          y="27"
          width={shape().width}
          height="40"
          rx="8"
          class="checkpoint-mask"
        />
        <Show when={other() && other() !== shape()}>
          <rect
            x={shape().left < other()!.left ? shape().left : other()!.left + other()!.width}
            y="27"
            width={
              shape().left < other()!.left
                ? other()!.left - shape().left
                : shape().left + shape().width - other()!.left - other()!.width
            }
            height="40"
            class="checkpoint-added"
          />
          <rect
            x={other()!.left < shape().left ? other()!.left : shape().left + shape().width}
            y="27"
            width={
              other()!.left < shape().left
                ? shape().left - other()!.left
                : other()!.left + other()!.width - shape().left - shape().width
            }
            height="40"
            class="checkpoint-removed"
          />
        </Show>
      </g>
    </svg>
  );
}

export function CheckpointReview(props: { language: Language; imperial: boolean }) {
  const c = () => checkpointCopy[props.language];
  const [current, setCurrent] = createSignal<FixtureId>('followup');
  const [versions, setVersions] = createSignal<Checkpoint[]>([]);
  const [version, setVersion] = createSignal('current');
  const [compare, setCompare] = createSignal('');
  const [name, setName] = createSignal('');
  const [linked, setLinked] = createSignal(true);
  const [zoom, setZoom] = createSignal(100);
  const [otherZoom, setOtherZoom] = createSignal(100);
  const [overlay, setOverlay] = createSignal(false);
  const [unit, setUnit] = createSignal<Unit>();
  const [state, setState] = createSignal<MeasurementState>('ready');
  const [restored, setRestored] = createSignal(false);
  let dialog!: HTMLDialogElement;

  const areaUnit = () => unit() ?? (props.imperial ? 'ft²' : 'm²');
  const entries = () => [
    ...fixtureIds.map((id) => ({ id, name: c()[id], fixture: id })),
    ...versions(),
  ];
  const find = (id: string) => entries().find((item) => item.id === id);
  const primary = () => find(version())?.fixture ?? current();
  const comparison = () => find(compare())?.fixture;
  const fmt = (value: number) =>
    new Intl.NumberFormat(props.language, { maximumFractionDigits: 2 }).format(
      value * units[areaUnit()],
    ) +
    ' ' +
    areaUnit();
  const add = (title: string, fixture: FixtureId) =>
    setVersions((previous) => [...previous, { id: crypto.randomUUID(), name: title, fixture }]);
  function restore() {
    add(c().previous, current());
    setCurrent(primary());
    setVersion('current');
    setRestored(true);
    dialog.close();
  }

  return (
    <section class="review-flow" aria-label={c().mode}>
      <p class="review-note">{c().transient}</p>
      <div class="review-grid">
        <section class="project-pane">
          <h3>{c().mode}</h3>
          <div class="review-fields">
            <label>
              {c().version}
              <select
                data-control-id={control('version')}
                value={version()}
                onChange={(e) => {
                  setVersion(e.currentTarget.value);
                  if (compare() === version()) setCompare('');
                }}
              >
                <option value="current">{c().current}</option>
                <For each={entries()}>
                  {(entry) => <option value={entry.id}>{entry.name}</option>}
                </For>
              </select>
            </label>
            <label>
              {c().compare}
              <select
                data-control-id={control('compare')}
                value={compare()}
                onChange={(e) => setCompare(e.currentTarget.value)}
              >
                <option value="">—</option>
                <For each={entries().filter(({ id }) => id !== version())}>
                  {(entry) => <option value={entry.id}>{entry.name}</option>}
                </For>
              </select>
            </label>
          </div>
          <div class="checkpoint-maps">
            <SampleMap
              id={primary()}
              against={overlay() ? comparison() : undefined}
              zoom={zoom()}
              label={find(version())?.name ?? c().current}
            />
            <Show when={comparison()}>
              {(other) => (
                <SampleMap
                  id={other()}
                  zoom={linked() ? zoom() : otherZoom()}
                  label={find(compare())!.name}
                />
              )}
            </Show>
          </div>
          <div class="review-fields">
            <label>
              {c().zoom}
              <input
                data-control-id={control('zoom')}
                type="range"
                min="100"
                max="200"
                value={zoom()}
                onInput={(e) => setZoom(e.currentTarget.valueAsNumber)}
              />
            </label>
            <Show when={comparison()}>
              <label>
                {c().secondZoom}
                <input
                  data-control-id={control('secondZoom')}
                  type="range"
                  min="100"
                  max="200"
                  disabled={linked()}
                  value={linked() ? zoom() : otherZoom()}
                  onInput={(e) => setOtherZoom(e.currentTarget.valueAsNumber)}
                />
              </label>
              <label class="review-check">
                <input
                  data-control-id={control('linked')}
                  type="checkbox"
                  checked={linked()}
                  onChange={(e) => setLinked(e.currentTarget.checked)}
                />
                {c().linked}
              </label>
              <label class="review-check">
                <input
                  data-control-id={control('overlay')}
                  type="checkbox"
                  checked={overlay()}
                  onChange={(e) => setOverlay(e.currentTarget.checked)}
                />
                {c().overlay}
              </label>
            </Show>
          </div>
          <Show when={comparison() && primary() !== comparison()}>
            <p>{c().fixtureChanged}</p>
            <Show when={overlay()}>
              <p class="checkpoint-legend">
                <span>{c().added}</span>
                <span>{c().removed}</span>
              </p>
            </Show>
          </Show>
          <form
            class="review-fields"
            onSubmit={(e) => {
              e.preventDefault();
              if (name().trim()) {
                add(name().trim(), current());
                setName('');
              }
            }}
          >
            <label>
              {c().name}
              <input
                data-control-id={control('name')}
                maxlength="80"
                required
                value={name()}
                onInput={(e) => setName(e.currentTarget.value)}
              />
            </label>
            <button data-control-id={control('create')} disabled={!name().trim()}>
              {c().create}
            </button>
          </form>
          <button
            type="button"
            class="secondary"
            data-control-id={control('restore')}
            disabled={version() === 'current'}
            onClick={() => dialog.showModal()}
          >
            {c().restore}
          </button>
          <Show when={restored()}>
            <p role="status">{c().restored}</p>
          </Show>
          <dialog
            ref={(element) => (dialog = element)}
            class="drawing-dialog"
            aria-labelledby="checkpoint-restore-title"
          >
            <h3 id="checkpoint-restore-title">{c().restore}</h3>
            <p>{c().restoreHelp}</p>
            <p>
              <strong>{find(version())?.name}</strong>
            </p>
            <div class="review-actions">
              <button
                type="button"
                class="secondary"
                data-control-id={control('cancel')}
                onClick={() => dialog.close()}
              >
                {c().cancel}
              </button>
              <button type="button" data-control-id={control('confirm')} onClick={restore}>
                {c().confirm}
              </button>
            </div>
          </dialog>
        </section>
        <section class="project-pane">
          <h3>{c().measurements}</h3>
          <div class="review-fields">
            <label>
              {c().state}
              <select
                data-control-id={control('state')}
                value={state()}
                onChange={(e) => setState(e.currentTarget.value as MeasurementState)}
              >
                <For each={measurementStates}>
                  {(key) => <option value={key}>{c()[key]}</option>}
                </For>
              </select>
            </label>
            <label>
              {c().unit}
              <select
                data-control-id={control('unit')}
                value={areaUnit()}
                onChange={(e) => setUnit(e.currentTarget.value as Unit)}
              >
                <For each={Object.keys(units)}>{(value) => <option>{value}</option>}</For>
              </select>
            </label>
          </div>
          <p role="status">
            {c()[state()]} · {state() === 'missing' ? c().needsCalibration : c().fixtureCalibration}
          </p>
          <dl class="review-facts">
            <dt>{c().crop}</dt>
            <dd>{checkpointFixtures[primary()].crop}%</dd>
            <For each={['area', 'layer', 'category', 'unique'] as const}>
              {(key) => (
                <>
                  <dt>{c()[key]}</dt>
                  <dd>
                    {state() === 'ready' || state() === 'stale'
                      ? fmt(checkpointFixtures[primary()][key])
                      : '—'}
                    <Show when={state() === 'ready' && comparison()}>
                      {(other) => {
                        const change = () =>
                          checkpointFixtures[primary()][key] - checkpointFixtures[other()][key];
                        return (
                          <small>
                            {c().delta} {change() > 0 ? '+' : ''}
                            {fmt(change())}
                          </small>
                        );
                      }}
                    </Show>
                  </dd>
                </>
              )}
            </For>
          </dl>
        </section>
      </div>
      <PatternReview language={props.language} />
    </section>
  );
}
