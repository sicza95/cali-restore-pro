import { createEffect, createMemo, createSignal, For, onCleanup, Show } from 'solid-js';
import {
  captureCheckpoint,
  checkpointLimit,
  restoreCheckpoint,
} from '../../../platform/projects/assessment-checkpoints';
import type { AssessmentCheckpoint } from '../../../platform/projects/assessment-checkpoints';
import type { CheckpointComparison } from '../../../platform/projects/checkpoint.worker';
import { displayArea } from '../../../platform/projects/planar-measurement';
import type { PlanarSurface } from '../../../platform/projects/planar-types';
import { sameSource } from '../../../platform/projects/planar-state';
import type { LocalVault } from '../../../platform/vault/vault';
import { PatternReview } from '../../editor/checkpoint-review/PatternReview';
import type { Language } from '../types';
import { drawingCopy } from '../../editor/drawing-review/copy';
import { layerName } from '../../editor/drawing-review/DrawingLayers';
import { surfaceCheckpointCopy } from './checkpoint-copy';
import { CheckpointMaps } from './CheckpointMaps';
import { surfaceCopy } from './surface-copy';
import './checkpoint-maps.css';

const id = (key: string) => 'checkpoint.review.' + key;
type Row = { areaM2: { value: number | null }; percent: { value: number | null } };

export function SurfaceCheckpoints(props: {
  language: Language;
  imperial: boolean;
  state?: PlanarSurface;
  checkpoints: AssessmentCheckpoint[];
  vault: LocalVault;
  project: string;
  busy: boolean;
  restoreBlocked: boolean;
  create: (checkpoints: AssessmentCheckpoint[]) => Promise<boolean>;
  restore: (assessment: PlanarSurface, checkpoints: AssessmentCheckpoint[]) => Promise<boolean>;
}) {
  const c = () => surfaceCheckpointCopy[props.language];
  const [name, setName] = createSignal('');
  const [version, setVersion] = createSignal('current');
  const [compare, setCompare] = createSignal('');
  const [unit, setUnit] = createSignal<'m' | 'ft'>();
  const [restored, setRestored] = createSignal(false);
  const [result, setResult] = createSignal<CheckpointComparison | null>();
  let dialog!: HTMLDialogElement;
  const entries = () => [
    { id: 'current', name: c().current, assessment: props.state },
    ...props.checkpoints,
  ];
  const chosen = () => props.checkpoints.find((item) => item.id === version());
  const primary = () => chosen()?.assessment ?? props.state;
  const comparison = () => entries().find((item) => item.id === compare());
  const other = () => comparison()?.assessment;
  const comparable = () =>
    !!(primary() && other() && sameSource(primary()!.source, other()!.source));
  const full = () => props.checkpoints.length >= checkpointLimit;
  const mayRestore = () =>
    !!(
      chosen() &&
      props.state &&
      sameSource(chosen()!.assessment.source, props.state.source) &&
      !full() &&
      !props.restoreBlocked &&
      !props.busy
    );
  const units = () => unit() ?? (props.imperial ? 'ft' : 'm');
  const number = (value: number) =>
    new Intl.NumberFormat(props.language, { maximumSignificantDigits: 6 }).format(value);
  const area = (value: number) => number(displayArea(value, units())) + ' ' + units() + '²';
  const format = (row?: Row) =>
    row?.areaM2.value != null
      ? area(row.areaM2.value)
      : row?.percent.value != null
        ? number(row.percent.value) + '%'
        : '—';
  const delta = (left?: Row, right?: Row) => {
    if (left?.areaM2.value != null && right?.areaM2.value != null) {
      const change = left.areaM2.value - right.areaM2.value;
      return (change > 0 ? '+' : '') + area(change);
    }
    if (left?.percent.value == null || right?.percent.value == null) return '';
    const change = left.percent.value - right.percent.value;
    return (change > 0 ? '+' : '') + number(change) + ' pp';
  };

  createEffect(() => {
    const state = primary();
    const baseline = comparable() ? other() : undefined;
    setResult(undefined);
    if (!state) return;
    let worker: Worker;
    try {
      worker = new Worker(
        new URL('../../../platform/projects/checkpoint.worker.ts', import.meta.url),
        { type: 'module' },
      );
    } catch {
      setResult(null);
      return;
    }
    const finish = (value: CheckpointComparison | null) => {
      setResult(value);
      worker.terminate();
      clearTimeout(timer);
    };
    const timer = setTimeout(() => finish(null), 10_000);
    worker.onmessage = (event: MessageEvent<CheckpointComparison | null>) => finish(event.data);
    worker.onerror = () => finish(null);
    onCleanup(() => {
      clearTimeout(timer);
      worker.terminate();
    });
    worker.postMessage({ primary: state, other: baseline });
  });

  const quantities = createMemo(() => {
    const initialResult = result();
    if (!initialResult) return [];
    const row = (id: string, label: string, a?: Row, b?: Row) => ({ id, label, a, b });
    const list = (key: 'layers' | 'categories') => {
      const left = initialResult.primary[key];
      const right = initialResult.other?.[key] ?? [];
      return [...new Set([...left, ...right].map(({ id }) => id))].map((id) => {
        const drawing = [...(primary()?.drawing ?? []), ...(other()?.drawing ?? [])];
        const layer = drawing.find((item) => (item.key ?? String(item.id)) === id);
        const zero = (state: typeof initialResult.primary): Row => ({
          areaM2: { value: state.assessed.areaM2.value == null ? null : 0 },
          percent: { value: state.assessed.percent.value == null ? null : 0 },
        });
        return row(
          key + id,
          layer ? layerName(layer, drawingCopy(props.language)) : id,
          left.find((item) => item.id === id) ?? zero(initialResult.primary),
          right.find((item) => item.id === id) ??
            (initialResult.other && zero(initialResult.other)),
        );
      });
    };
    return [
      row('assessed', c().area, initialResult.primary.assessed, initialResult.other?.assessed),
      row('damage', c().unique, initialResult.primary.damage, initialResult.other?.damage),
      ...list('layers'),
      ...list('categories'),
    ];
  });

  async function restore() {
    if (!mayRestore()) return;
    const current = props.state!;
    const target = chosen()!;
    const previous = captureCheckpoint(c().previous, current);
    if (await props.restore(restoreCheckpoint(current, target), [...props.checkpoints, previous])) {
      setVersion('current');
      setCompare(previous.id);
      setRestored(true);
      dialog.close();
    }
  }
  const changed = (pick: (state: PlanarSurface) => unknown) =>
    comparable() && JSON.stringify(pick(primary()!)) !== JSON.stringify(pick(other()!));
  return (
    <section class="review-flow" aria-label={c().mode}>
      <div class="review-grid">
        <section class="project-pane">
          <h3>{c().mode}</h3>
          <div class="review-fields">
            <label>
              {c().version}
              <select
                data-control-id={id('version')}
                value={version()}
                onChange={(e) => {
                  setVersion(e.currentTarget.value);
                  if (compare() === version()) setCompare('');
                  setRestored(false);
                }}
              >
                <For each={entries()}>
                  {(entry) => (
                    <option value={entry.id} selected={version() === entry.id}>
                      {entry.name}
                    </option>
                  )}
                </For>
              </select>
            </label>
            <label>
              {c().compare}
              <select
                data-control-id={id('compare')}
                value={compare()}
                onChange={(e) => setCompare(e.currentTarget.value)}
              >
                <option value="" selected={!compare()}>
                  —
                </option>
                <For each={entries().filter((entry) => entry.id !== version() && entry.assessment)}>
                  {(entry) => (
                    <option value={entry.id} selected={compare() === entry.id}>
                      {entry.name}
                    </option>
                  )}
                </For>
              </select>
            </label>
          </div>
          <Show when={primary()} fallback={<p role="status">{c().unavailable}</p>}>
            {(state) => (
              <CheckpointMaps
                primary={state()}
                other={comparable() ? other() : undefined}
                label={chosen()?.name ?? c().current}
                otherLabel={comparison()?.name}
                copy={c()}
                photoCopy={surfaceCopy[props.language]}
                vault={props.vault}
                project={props.project}
                result={result() ?? undefined}
              />
            )}
          </Show>
          <Show when={other() && !comparable()}>
            <p role="status">{c().incompatible}</p>
          </Show>
          <Show when={changed((state) => state.frame.input)}>
            <p>{c().cropChanged}</p>
          </Show>
          <Show
            when={changed((state) => ({
              input: state.calibration?.input,
              current: state.calibration?.frameRevision === state.frame.revision,
            }))}
          >
            <p>{c().calibrationChanged}</p>
          </Show>
          <form
            class="review-fields"
            onSubmit={async (e) => {
              e.preventDefault();
              const current = props.state;
              if (
                current &&
                name().trim() &&
                !props.busy &&
                !full() &&
                (await props.create([...props.checkpoints, captureCheckpoint(name(), current)]))
              )
                setName('');
            }}
          >
            <label>
              {c().name}
              <input
                data-control-id={id('name')}
                maxlength="80"
                value={name()}
                required
                onInput={(e) => setName(e.currentTarget.value)}
              />
            </label>
            <button
              data-control-id={id('create')}
              disabled={!props.state || !name().trim() || props.busy || full()}
            >
              {c().create}
            </button>
          </form>
          <button
            class="secondary"
            type="button"
            data-control-id={id('restore')}
            disabled={!mayRestore()}
            onClick={() => dialog.showModal()}
          >
            {c().restore}
          </button>
          <Show when={full()}>
            <p role="status">{c().full}</p>
          </Show>
          <Show when={props.restoreBlocked}>
            <p>{c().pending}</p>
          </Show>
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
              <strong>{chosen()?.name}</strong>
            </p>
            <div class="review-actions">
              <button
                type="button"
                class="secondary"
                data-control-id={id('cancel')}
                onClick={() => dialog.close()}
              >
                {c().cancel}
              </button>
              <button
                type="button"
                data-control-id={id('confirm')}
                disabled={!mayRestore()}
                onClick={restore}
              >
                {c().confirm}
              </button>
            </div>
          </dialog>
        </section>
        <section class="project-pane">
          <h3>{c().measurements}</h3>
          <label>
            {c().unit}
            <select
              data-control-id={id('unit')}
              value={units()}
              onChange={(e) => setUnit(e.currentTarget.value as 'm' | 'ft')}
            >
              <option value="m">m²</option>
              <option value="ft">ft²</option>
            </select>
          </label>
          <Show when={primary() && !result()}>
            <p role="status">{result() === null ? c().error : c().computing}</p>
          </Show>
          <Show when={result()?.primary.assessed.areaM2.value === null}>
            <p>{c().needsCalibration}</p>
          </Show>
          <dl class="review-facts">
            <For each={quantities()}>
              {(item) => (
                <>
                  <dt>{item.label}</dt>
                  <dd>
                    {format(item.a)}
                    <Show when={item.b}>
                      <small>
                        {format(item.b)}
                        <Show when={delta(item.a, item.b)}>
                          {(change) => (
                            <>
                              {' '}
                              · {c().delta} {change()}
                            </>
                          )}
                        </Show>
                      </small>
                    </Show>
                  </dd>
                </>
              )}
            </For>
          </dl>
        </section>
      </div>
      <PatternReview language={props.language} vault={props.vault} />
    </section>
  );
}
