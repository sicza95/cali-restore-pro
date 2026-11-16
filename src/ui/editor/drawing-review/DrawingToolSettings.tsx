import { For, Show, untrack } from 'solid-js';
import { control } from './constants';
import type { DrawingCopy } from './copy';
import type { DrawingReview } from './createDrawingReview';
import type { DrawingTools } from './createDrawingTools';
import { DrawNumber, DrawToggle } from './DrawingFields';
import { DrawingSketchActions, sketchActive } from './DrawingSketchActions';
import type { BrushOptions, Operation, Shape } from './types';

/**
 * The active tool's heading, help and settings: brush behaviour, path operation, the node tool's
 * mark picker and close path. Brush width, shape kind, Apply and Cancel sit in the editor shell's
 * tool chip (`DrawingToolOptions`); numeric entry sits in "Enter by number".
 */
export function DrawingToolSettings(props: {
  model: DrawingReview;
  tools: DrawingTools;
  copy: DrawingCopy;
  reason: string;
  /**
   * One line of help for brush, pen and shape: draw on the photo, or a button that opens numeric
   * entry. `id` lets the canvas point at it.
   */
  help: { id: string; onNumeric: () => void };
}) {
  const m = untrack(() => props.model);
  const t = untrack(() => props.tools);
  const c = () => props.copy;
  const nodes = () => t.tool() === 'nodes';
  const shape = () => t.tool() === 'shape';
  const setBrush = (changes: Partial<BrushOptions>) => t.setBrush({ ...t.brush(), ...changes });
  return (
    <section class="drawing-panel" aria-label={c().tool}>
      <h2>{c()[t.tool()]}</h2>
      <Show when={drawHelpShown(t, props.reason)}>
        <p id={props.help.id} class="drawing-tool-help">
          {c().drawHelp}{' '}
          <button type="button" onClick={() => props.help.onNumeric()}>
            {c().enterByNumber}
          </button>
        </p>
      </Show>
      <Show when={t.tool() === 'select'}>
        <p>{c().navigateHelp}</p>
      </Show>
      <Show when={t.tool() === 'hand'}>
        <p>{c().panHelp}</p>
      </Show>
      <Show when={t.brushing() || t.sketching()}>
        <Show when={!props.reason} fallback={<p role="status">{props.reason}</p>}>
          <Show when={t.brushing()}>
            <DrawToggle
              name="brush.pressure"
              label={c().pressure}
              checked={t.brush().pressure}
              onValue={(pressure) => setBrush({ pressure })}
            />
            <DrawToggle
              name="brush.stabilize"
              label={c().stabilize}
              checked={t.brush().stabilize}
              onValue={(stabilize) => setBrush({ stabilize })}
            />
            <Show when={t.brush().stabilize}>
              <DrawNumber
                name="brush.strength"
                label={c().strength}
                value={t.brush().strength}
                onValue={(strength) => setBrush({ strength })}
              />
            </Show>
            <DrawToggle
              name="brush.outline"
              label={c().brushOutline}
              checked={t.brush().outline}
              onValue={(outline) => setBrush({ outline })}
            />
            <DrawToggle
              name="brush.finger"
              label={c().finger}
              checked={t.brush().finger}
              onValue={(finger) => setBrush({ finger })}
            />
          </Show>
          <Show when={t.sketching()}>
            <Show
              when={nodes()}
              fallback={
                <>
                  <label>
                    {c().operation}
                    <select
                      data-control-id={control('path.operation')}
                      value={t.operation()}
                      onChange={(e) => t.setOperation(e.currentTarget.value as Operation)}
                    >
                      <For each={['add', 'subtract', 'replace'] as const}>
                        {(key) => <option value={key}>{c()[key]}</option>}
                      </For>
                    </select>
                  </label>
                </>
              }
            >
              <label>
                {c().mark}
                <select
                  data-control-id={control('point.mark')}
                  value={String(t.sketch().mark?.id ?? '')}
                  onChange={(e) => {
                    const mark = m
                      .layer()
                      .marks.find((mark) => mark.id === Number(e.currentTarget.value));
                    if (mark) t.edit(mark);
                    else t.reset();
                  }}
                >
                  <option value="">—</option>
                  <For each={m.layer().marks}>
                    {(mark, index) => (
                      <option value={mark.id}>
                        {index() + 1} · {c()[mark.action]}
                      </option>
                    )}
                  </For>
                </select>
              </label>
            </Show>
          </Show>
          <Show when={sketchActive(t, props.reason)}>
            <Show when={!shape() && (t.sketch().points.length >= 3 || t.sketch().closed)}>
              <DrawToggle
                name="path.close"
                label={c().closePath}
                checked={t.sketch().closed}
                onValue={(closed) => t.setSketch({ ...t.sketch(), closed })}
              />
            </Show>
            <p class="drawing-help">{c().noSketch}</p>
          </Show>
        </Show>
      </Show>
    </section>
  );
}

/** True for brush and eraser, and for pen and shape: the tools that draw on the photo. */
export const drawHelpShown = (tools: DrawingTools, reason: string) =>
  !reason && (tools.brushing() || (tools.sketching() && tools.tool() !== 'nodes'));

type OptionProps = { tools: DrawingTools; copy: DrawingCopy };

function BrushWidth(props: OptionProps) {
  const t = untrack(() => props.tools);
  return (
    <DrawNumber
      name="brush.width"
      label={props.copy.width}
      value={t.brush().width}
      min={0.1}
      max={20}
      onValue={(width) => t.setBrush({ ...t.brush(), width })}
    />
  );
}

function ShapeKind(props: OptionProps) {
  const t = untrack(() => props.tools);
  return (
    <label>
      {props.copy.shape}
      <select
        data-control-id={control('shape.kind')}
        value={t.shape()}
        onChange={(e) => {
          t.setShape(e.currentTarget.value as Shape);
          t.reset();
        }}
      >
        <For each={['rectangle', 'ellipse', 'polygon'] as const}>
          {(key) => <option value={key}>{props.copy[key]}</option>}
        </For>
      </select>
    </label>
  );
}

/**
 * The editor shell's tool chip: brush width or shape kind for the active tool, and the sketch's
 * point count, Apply and Cancel.
 */
export function DrawingToolOptions(props: OptionProps & { reason: string }) {
  const t = untrack(() => props.tools);
  return (
    <Show when={!props.reason}>
      <Show when={t.brushing()}>
        <BrushWidth tools={t} copy={props.copy} />
      </Show>
      <Show when={t.tool() === 'shape'}>
        <ShapeKind tools={t} copy={props.copy} />
      </Show>
      <Show when={sketchActive(t, props.reason)}>
        <DrawingSketchActions tools={t} copy={props.copy} count />
      </Show>
    </Show>
  );
}
