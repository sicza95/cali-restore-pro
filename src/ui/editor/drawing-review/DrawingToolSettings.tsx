import { For, Show, untrack } from 'solid-js';
import type { JSX } from 'solid-js';
import { Dynamic } from 'solid-js/web';
import { control } from './constants';
import type { DrawingCopy } from './copy';
import type { DrawingReview } from './createDrawingReview';
import type { DrawingTools } from './createDrawingTools';
import { DrawNumber, DrawToggle } from './DrawingFields';
import { DrawingSketchActions, sketchActive } from './DrawingSketchActions';
import type { BrushOptions, Operation, Shape } from './types';

/**
 * The active tool's heading, help and settings: brush behaviour, path operation, the node tool's
 * mark picker, close path and, unless the host shows them, the sketch's Apply and Cancel. Numeric entry renders separately,
 * through `DrawingNumericEntry`, or in the `numeric` slot where it sits between the two.
 */
export function DrawingToolSettings(props: {
  model: DrawingReview;
  tools: DrawingTools;
  copy: DrawingCopy;
  reason: string;
  /** False when the host shows brush width and shape kind itself, through `DrawingToolOptions`. */
  toolOptions?: boolean;
  /** False when the host shows Apply and Cancel itself, through `DrawingToolOptions`. */
  actions?: boolean;
  /** Heading level of the tool's name; 3 by default. */
  level?: 2 | 3;
  /** Rendered after the tool's settings and before close path and Apply. */
  numeric?: JSX.Element;
}) {
  const m = untrack(() => props.model);
  const t = untrack(() => props.tools);
  const c = () => props.copy;
  const nodes = () => t.tool() === 'nodes';
  const shape = () => t.tool() === 'shape';
  const setBrush = (changes: Partial<BrushOptions>) => t.setBrush({ ...t.brush(), ...changes });
  const options = () => props.toolOptions !== false;
  return (
    <section class="drawing-panel" aria-label={c().tool}>
      <Dynamic component={props.level === 2 ? 'h2' : 'h3'}>{c()[t.tool()]}</Dynamic>
      <Show when={t.tool() === 'select'}>
        <p>{c().navigateHelp}</p>
      </Show>
      <Show when={t.tool() === 'hand'}>
        <p>{c().panHelp}</p>
      </Show>
      <Show when={t.brushing() || t.sketching()}>
        <Show when={!props.reason} fallback={<p role="status">{props.reason}</p>}>
          <Show when={t.brushing()}>
            <Show when={options()}>
              <BrushWidth tools={t} copy={c()} />
            </Show>
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
                  <p>{shape() ? c().shapeHelp : c().pathHelp}</p>
                  <Show when={shape() && options()}>
                    <ShapeKind tools={t} copy={c()} />
                  </Show>
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
          {props.numeric}
          <Show when={sketchActive(t, props.reason)}>
            <Show when={!shape() && (t.sketch().points.length >= 3 || t.sketch().closed)}>
              <DrawToggle
                name="path.close"
                label={c().closePath}
                checked={t.sketch().closed}
                onValue={(closed) => t.setSketch({ ...t.sketch(), closed })}
              />
            </Show>
            <Show when={props.actions !== false}>
              <DrawingSketchActions tools={t} copy={c()} />
            </Show>
            <p class="drawing-help">{c().noSketch}</p>
          </Show>
        </Show>
      </Show>
    </section>
  );
}

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
 * Brush width or shape kind for the active tool, for the editor shell's tool chip. With
 * `actions`, the chip also holds the sketch's point count, Apply and Cancel.
 */
export function DrawingToolOptions(props: OptionProps & { reason: string; actions?: boolean }) {
  const t = untrack(() => props.tools);
  return (
    <Show when={!props.reason}>
      <Show when={t.brushing()}>
        <BrushWidth tools={t} copy={props.copy} />
      </Show>
      <Show when={t.tool() === 'shape'}>
        <ShapeKind tools={t} copy={props.copy} />
      </Show>
      <Show when={props.actions && sketchActive(t, props.reason)}>
        <DrawingSketchActions tools={t} copy={props.copy} count />
      </Show>
    </Show>
  );
}
