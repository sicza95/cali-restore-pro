import { For } from 'solid-js';
import type { SurfaceCopy } from './surface-copy';
import { directions } from './surface-review-controls';
import { nudge } from './surface-review-model';

export function SurfacePanControls(props: {
  copy: SurfaceCopy;
  disabled: boolean;
  move: (dx: number, dy: number) => void;
}) {
  return (
    <div class="surface-actions" role="group" aria-label={props.copy.pan}>
      <For each={directions}>
        {(direction) => (
          <button
            type="button"
            class="secondary"
            data-control-id={`surface.view.pan.${direction}`}
            disabled={props.disabled}
            onClick={() => {
              const [dx, dy] = nudge[direction];
              props.move(dx, dy);
            }}
          >
            {props.copy[direction]}
          </button>
        )}
      </For>
    </div>
  );
}
