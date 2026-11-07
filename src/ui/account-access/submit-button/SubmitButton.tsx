import type { SubmitButtonProps } from './types';

export function SubmitButton(props: SubmitButtonProps) {
  return (
    <button type="submit" disabled={props.busy} data-control-id={props.controlId}>
      {props.t(props.busy ? 'working' : (props.label ?? 'submit'))}
    </button>
  );
}
