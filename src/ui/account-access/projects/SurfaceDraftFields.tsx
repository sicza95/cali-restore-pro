import { For } from 'solid-js';
import { fields, toolFields } from './surface-review-controls';
import type { ReviewTool } from './surface-review-controls';
import type { SurfaceDraft } from './surface-review-model';
import type { SurfaceCopy } from './surface-copy';

export function SurfaceDraftFields(props: {
  tool: ReviewTool;
  copy: SurfaceCopy;
  draft: SurfaceDraft;
  valid: boolean;
  setDraft: (value: SurfaceDraft) => void;
}) {
  return (
    <div class="surface-fields">
      <For each={props.tool === 'align' && props.draft.referenceOnly ? [] : toolFields[props.tool]}>
        {(field) => (
          <label>
            {props.copy[field]}{' '}
            <small>
              {fields[field][0]}–{fields[field][1]}
            </small>
            <input
              type="number"
              step="any"
              min={fields[field][0]}
              max={fields[field][1]}
              required
              value={props.draft[field]}
              data-control-id={'surface.review.' + field}
              aria-describedby={!props.valid ? 'surface-review-invalid' : undefined}
              onInput={(e) => props.setDraft({ ...props.draft, [field]: e.currentTarget.value })}
            />
          </label>
        )}
      </For>
    </div>
  );
}
