import { For, Show } from 'solid-js';
import { tools } from './surface-review-controls';
import type { ReviewTool } from './surface-review-controls';
import type { SurfaceCopy } from './surface-copy';

export function SurfaceToolReasons(props: {
  reason: (key: ReviewTool) => string;
  copy: SurfaceCopy;
}) {
  return (
    <For each={tools}>
      {(key) => (
        <Show when={props.reason(key)}>
          <span class="surface-reason" id={`surface.review.${key}-reason`}>
            {props.copy[key]} · {props.reason(key)}
          </span>
        </Show>
      )}
    </For>
  );
}
