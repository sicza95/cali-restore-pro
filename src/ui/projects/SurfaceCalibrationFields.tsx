import { Show } from 'solid-js';
import { GuideFields } from './SurfaceReviewGuides';
import type { SurfaceCopy } from './surface-copy';
import type { SurfaceDraft } from './surface-review-model';

const id = (key: string) => 'surface.review.' + key;

export function SurfaceCalibrationFields(props: {
  copy: SurfaceCopy;
  draft: SurfaceDraft;
  setDraft: (value: SurfaceDraft) => void;
}) {
  return (
    <>
      <label>
        {props.copy.method}
        <select
          data-control-id={id('method')}
          value={props.draft.method}
          onChange={(e) => props.setDraft({ ...props.draft, method: e.currentTarget.value })}
        >
          <option value="dimensions">{props.copy.dimensions}</option>
          <option value="lines">{props.copy.lines}</option>
        </select>
      </label>
      <Show when={props.draft.method === 'lines'}>
        <p>{props.copy.lineHelp}</p>
        <GuideFields copy={props.copy} draft={props.draft} change={props.setDraft} />
      </Show>
      <label>
        {props.copy.unit}
        <select
          data-control-id={id('unit')}
          value={props.draft.unit}
          onChange={(e) => props.setDraft({ ...props.draft, unit: e.currentTarget.value })}
        >
          <option value="mm">mm</option>
          <option value="cm">cm</option>
          <option value="m">m</option>
          <option value="in">in</option>
          <option value="ft">ft</option>
        </select>
      </label>
    </>
  );
}
