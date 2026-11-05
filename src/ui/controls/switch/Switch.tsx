import { Show } from 'solid-js';
import type { SwitchProps } from './types';

export function Switch(props: SwitchProps) {
  return (
    <label class="cr-switch-row">
      <span>
        <strong>{props.label}</strong>
        <Show when={props.description}>
          <small>{props.description}</small>
        </Show>
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={props.checked}
        onChange={(event) => props.onChange(event.currentTarget.checked)}
      />
      <span class="cr-switch-track" aria-hidden="true" />
    </label>
  );
}
