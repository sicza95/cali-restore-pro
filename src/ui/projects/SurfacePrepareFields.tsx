import type { SurfaceCopy } from './surface-copy';
import type { SurfaceDraft } from './surface-review-model';

const id = (key: string) => 'surface.review.' + key;

/** The "Prepare" tool's own fields: aspect, flip and rectify. */
export function SurfacePrepareFields(props: {
  copy: SurfaceCopy;
  draft: SurfaceDraft;
  setDraft: (value: SurfaceDraft) => void;
}) {
  return (
    <>
      <label>
        {props.copy.aspect}
        <select
          data-control-id={id('aspect')}
          value={props.draft.aspect}
          onChange={(e) => props.setDraft({ ...props.draft, aspect: e.currentTarget.value })}
        >
          <option value="free">{props.copy.free}</option>
          <option value="square">{props.copy.square}</option>
        </select>
      </label>
      <label>
        <input
          data-control-id={id('flip')}
          type="checkbox"
          checked={props.draft.flip}
          onChange={(e) => props.setDraft({ ...props.draft, flip: e.currentTarget.checked })}
        />
        {props.copy.flip}
      </label>
      <label>
        <input
          data-control-id={id('rectify')}
          type="checkbox"
          checked={props.draft.rectify}
          aria-describedby="surface-rectify-help"
          onChange={(e) => props.setDraft({ ...props.draft, rectify: e.currentTarget.checked })}
        />
        {props.copy.rectify}
      </label>
      <p id="surface-rectify-help">{props.copy.rectifyHelp}</p>
    </>
  );
}
