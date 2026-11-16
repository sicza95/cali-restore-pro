import { For, Show, untrack } from 'solid-js';
import type { JSX } from 'solid-js';
import { control } from './constants';
import type { DrawingCopy } from './copy';
import type { DrawingReview } from './createDrawingReview';
import type { DrawingTools } from './createDrawingTools';
import { DrawNumber, DrawToggle } from './DrawingFields';

/**
 * Coordinate fields and point editing for the active tool: the keyboard and assistive-technology
 * path for placing brush dots and path points by number. Renders nothing for select and hand.
 */
export function DrawingNumericEntry(props: {
  model: DrawingReview;
  tools: DrawingTools;
  copy: DrawingCopy;
  reason: string;
  /** When given, wraps the fields in their own panel with this accessible name. */
  label?: string;
}) {
  const m = untrack(() => props.model);
  const t = untrack(() => props.tools);
  const c = () => props.copy;
  const nodes = () => t.tool() === 'nodes';
  const corners = () => t.tool() === 'shape' && t.shape() !== 'polygon';
  const available = () =>
    !props.reason && (t.brushing() || (t.sketching() && (!nodes() || !!t.sketch().mark)));
  const coordinates = () => (
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
  const fields = (): JSX.Element => (
    <>
      <Show when={t.brushing()}>
        {coordinates()}
        <button
          type="button"
          data-control-id={control('brush.dot')}
          disabled={!m.contains(t.coordinates())}
          onClick={() => t.stroke([t.coordinates()])}
        >
          {c().addStroke}
        </button>
      </Show>
      <Show when={t.sketching()}>
        {coordinates()}
        <button
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
              onChange={(e) => t.setSketch({ ...t.sketch(), index: Number(e.currentTarget.value) })}
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
            type="button"
            data-control-id={control('point.delete')}
            disabled={nodes() && t.sketch().points.length <= t.minimum()}
            onClick={t.deletePoint}
          >
            {c().deletePoint}
          </button>
        </Show>
      </Show>
    </>
  );
  return (
    <Show when={available()}>
      <Show when={props.label} fallback={fields()}>
        <section class="drawing-panel" aria-label={props.label}>
          {fields()}
        </section>
      </Show>
    </Show>
  );
}
