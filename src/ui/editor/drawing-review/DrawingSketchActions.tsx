import { Show, untrack } from 'solid-js';
import { control } from './constants';
import type { DrawingCopy } from './copy';
import type { DrawingTools } from './createDrawingTools';

/** True while the pen, shape or node tool can apply or cancel a sketch. */
export const sketchActive = (tools: DrawingTools, reason: string) =>
  !reason && tools.sketching() && (tools.tool() !== 'nodes' || !!tools.sketch().mark);

/** Apply and Cancel for the current sketch, optionally with its live point count. */
export function DrawingSketchActions(props: {
  tools: DrawingTools;
  copy: DrawingCopy;
  count?: boolean;
}) {
  const t = untrack(() => props.tools);
  const c = () => props.copy;
  const points = () => t.sketch().points.length;
  return (
    <div class="drawing-actions drawing-sketch-actions">
      <Show when={props.count}>
        <span class="drawing-sketch-count" aria-live="polite">
          {points()} {points() === 1 ? c().pointUnit : c().pointsUnit}
        </span>
      </Show>
      <button
        type="button"
        data-control-id={control('path.apply')}
        disabled={!t.valid()}
        onClick={t.apply}
      >
        {t.tool() === 'nodes' ? c().applyPoints : c().apply}
      </button>
      <button
        class="secondary"
        type="button"
        data-control-id={control('path.cancel')}
        disabled={!points()}
        onClick={t.reset}
      >
        {c().cancel}
      </button>
    </div>
  );
}
