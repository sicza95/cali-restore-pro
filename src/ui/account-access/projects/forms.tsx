import type { Units } from '../../../platform/projects/types';
import type { projectCopy } from './project-copy';

export type Copy = (typeof projectCopy)['en'];
export function NameForm(props: {
  label: string;
  controlId?: string;
  action: string;
  value?: string;
  disabled: boolean;
  onSubmit: (name: string) => Promise<boolean>;
}) {
  return (
    <form
      class="project-fields"
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const name = String(new FormData(form).get('name')).trim();
        if (name)
          void props.onSubmit(name).then((saved) => {
            if (saved && props.value === undefined) form.reset();
          });
      }}
    >
      <label>
        {props.label}
        <input name="name" required maxLength={120} value={props.value ?? ''} />
      </label>
      <button data-control-id={props.controlId} disabled={props.disabled}>
        {props.action}
      </button>
    </form>
  );
}

export function UnitsField(props: {
  copy: Copy;
  value: Units | null;
  inherit?: boolean;
  label?: string;
}) {
  return (
    <label>
      {props.label ?? props.copy.units}
      <select name="units" value={props.value ?? ''}>
        {props.inherit && <option value="">{props.copy.inherit}</option>}
        <option value="metric">{props.copy.metric}</option>
        <option value="imperial">{props.copy.imperial}</option>
      </select>
    </label>
  );
}
