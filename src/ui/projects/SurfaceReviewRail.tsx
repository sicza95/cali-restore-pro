import { For } from 'solid-js';
import type { SurfaceCopy } from './surface-copy';
import { tools } from './surface-review-controls';
import type { ReviewTool } from './surface-review-controls';

const id = (key: string) => 'surface.review.' + key;

/**
 * The review tool buttons. An unavailable tool stays focusable (`aria-disabled`) and points at
 * its reason; `buttons` receives each element so closing a tool can return focus to it.
 */
export function SurfaceReviewRail(props: {
  copy: SurfaceCopy;
  tool?: ReviewTool;
  unavailable: (key: ReviewTool) => string;
  select: (key: ReviewTool) => void;
  buttons: Partial<Record<ReviewTool, HTMLButtonElement>>;
}) {
  return (
    <div class="surface-rail" role="group" aria-label={props.copy.tools}>
      <For each={tools}>
        {(key) => (
          <button
            type="button"
            data-control-id={id(key)}
            ref={(element) => {
              props.buttons[key] = element;
            }}
            aria-pressed={props.tool === key}
            aria-disabled={!!props.unavailable(key)}
            aria-describedby={props.unavailable(key) ? id(key) + '-reason' : undefined}
            onClick={() => {
              if (!props.unavailable(key)) props.select(key);
            }}
          >
            {props.copy[key]}
          </button>
        )}
      </For>
    </div>
  );
}
