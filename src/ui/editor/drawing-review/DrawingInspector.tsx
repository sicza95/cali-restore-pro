import { For, Show, untrack } from 'solid-js';
import { control } from './constants';
import type { DrawingCopy } from './copy';
import type { DrawingReview } from './createDrawingReview';
import type { DrawingTools } from './createDrawingTools';
import { DrawNumber, DrawToggle } from './DrawingFields';
import type { BrushOptions, Operation, Shape } from './types';

export function DrawingInspector(props: {
  model: DrawingReview;
  tools: DrawingTools;
  copy: DrawingCopy;
  reason: string;
}) {
  const m = untrack(() => props.model);
  const t = untrack(() => props.tools);
  const c = () => props.copy;
  const nodes = () => t.tool() === 'nodes';
  const shape = () => t.tool() === 'shape';
  const corners = () => shape() && t.shape() !== 'polygon';
  const setBrush = (changes: Partial<BrushOptions>) => t.setBrush({ ...t.brush(), ...changes });
  const inputCoordinates = () => (
    <div class="drawing-fields">
      <DrawNumber
        name="place.x"
        label={t.brushing() ? c().x : c().newX}
        value={t.coordinates().x}
        onValue={(x) => t.setCoordinates({ ...t.coordinates(), x })}
      />
      <DrawNumber
        name="place.y"
        label={t.brushing() ? c().y : c().newY}
        value={t.coordinates().y}
        onValue={(y) => t.setCoordinates({ ...t.coordinates(), y })}
      />
    </div>
  );
  return (
    <section class="drawing-panel" aria-label={c().tool}>
      <h3>{c()[t.tool()]}</h3>
      <Show when={t.tool() === 'select'}>
        <p>{c().navigateHelp}</p>
      </Show>
      <Show when={t.tool() === 'hand'}>
        <p>{c().panHelp}</p>
      </Show>
      <Show when={t.brushing() || t.sketching()}>
        <Show when={!props.reason} fallback={<p role="status">{props.reason}</p>}>
          <Show when={t.brushing()}>
            <DrawNumber
              name="brush.width"
              label={c().width}
              value={t.brush().width}
              min={0.1}
              max={20}
              onValue={(width) => setBrush({ width })}
            />
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
            {inputCoordinates()}
            <button
              class="secondary"
              type="button"
              data-control-id={control('brush.dot')}
              disabled={!m.contains(t.coordinates())}
              onClick={() => t.stroke([t.coordinates()])}
            >
              {c().addStroke}
            </button>
          </Show>
          <Show when={t.sketching()}>
            <Show
              when={nodes()}
              fallback={
                <>
                  <p>{shape() ? c().shapeHelp : c().pathHelp}</p>
                  <Show when={shape()}>
                    <label>
                      {c().shape}
                      <select
                        data-control-id={control('shape.kind')}
                        value={t.shape()}
                        onChange={(e) => {
                          t.setShape(e.currentTarget.value as Shape);
                          t.reset();
                        }}
                      >
                        <For each={['rectangle', 'ellipse', 'polygon'] as const}>
                          {(key) => <option value={key}>{c()[key]}</option>}
                        </For>
                      </select>
                    </label>
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
            <Show when={!nodes() || t.sketch().mark}>
              {inputCoordinates()}
              <button
                class="secondary"
                type="button"
                data-control-id={control('point.add')}
                disabled={t.sketch().points.length >= t.maximum()}
                onClick={() => t.addPoint(t.coordinates())}
              >
                {c().addPoint}
              </button>
              <Show when={t.node()}>
                <label>
                  {c().point}
                  <select
                    data-control-id={control('point.select')}
                    value={String(t.sketch().index)}
                    onChange={(e) =>
                      t.setSketch({ ...t.sketch(), index: Number(e.currentTarget.value) })
                    }
                  >
                    <For each={t.sketch().points}>
                      {(_, index) => <option value={index()}>{index() + 1}</option>}
                    </For>
                  </select>
                </label>
                <div class="drawing-fields">
                  <DrawNumber
                    name="point.x"
                    label={c().x}
                    value={t.node()!.x}
                    onValue={(x) => t.updatePoint({ x })}
                  />
                  <DrawNumber
                    name="point.y"
                    label={c().y}
                    value={t.node()!.y}
                    onValue={(y) => t.updatePoint({ y })}
                  />
                </div>
                <Show when={!corners()}>
                  <DrawToggle
                    name="point.curve"
                    label={c().curve}
                    checked={!!t.node()?.handle}
                    onValue={(curved) => {
                      const { x, y } = t.node()!;
                      t.updatePoint({ handle: curved ? { x, y } : undefined });
                    }}
                  />
                  <Show when={t.node()?.handle}>
                    <div class="drawing-fields">
                      <DrawNumber
                        name="point.handleX"
                        label={c().handleX}
                        value={t.node()!.handle!.x}
                        onValue={(x) => t.updatePoint({ handle: { ...t.node()!.handle!, x } })}
                      />
                      <DrawNumber
                        name="point.handleY"
                        label={c().handleY}
                        value={t.node()!.handle!.y}
                        onValue={(y) => t.updatePoint({ handle: { ...t.node()!.handle!, y } })}
                      />
                    </div>
                  </Show>
                </Show>
                <button
                  class="secondary"
                  type="button"
                  data-control-id={control('point.delete')}
                  disabled={nodes() && t.sketch().points.length <= t.minimum()}
                  onClick={t.deletePoint}
                >
                  {c().deletePoint}
                </button>
              </Show>
              <Show when={!shape() && (t.sketch().points.length >= 3 || t.sketch().closed)}>
                <DrawToggle
                  name="path.close"
                  label={c().closePath}
                  checked={t.sketch().closed}
                  onValue={(closed) => t.setSketch({ ...t.sketch(), closed })}
                />
              </Show>
              <div class="drawing-actions">
                <button
                  type="button"
                  data-control-id={control('path.apply')}
                  disabled={!t.valid()}
                  onClick={t.apply}
                >
                  {nodes() ? c().applyPoints : c().apply}
                </button>
                <button
                  class="secondary"
                  type="button"
                  data-control-id={control('path.cancel')}
                  disabled={!t.sketch().points.length}
                  onClick={t.reset}
                >
                  {c().cancel}
                </button>
              </div>
              <p class="drawing-help">{c().noSketch}</p>
            </Show>
          </Show>
        </Show>
      </Show>
    </section>
  );
}
