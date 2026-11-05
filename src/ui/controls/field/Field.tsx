import { Show, createUniqueId } from 'solid-js';
import type { FieldProps } from './types';

export function Field(props: FieldProps) {
  const id = createUniqueId();
  return (
    <div class="cr-field">
      <label for={id}>{props.label}</label>
      <div class="cr-field-input">
        <input
          id={id}
          value={props.value}
          inputMode={props.inputMode}
          aria-invalid={!!props.error}
          aria-describedby={props.error || props.hint ? `${id}-note` : undefined}
          onInput={(event) => props.onInput(event.currentTarget.value)}
        />
        <Show when={props.suffix}>
          <span>{props.suffix}</span>
        </Show>
      </div>
      <Show when={props.error || props.hint}>
        <small id={`${id}-note`} classList={{ 'cr-field-error': !!props.error }}>
          {props.error || props.hint}
        </small>
      </Show>
    </div>
  );
}
