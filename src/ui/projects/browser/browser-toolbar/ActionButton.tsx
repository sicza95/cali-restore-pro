import { createUniqueId, Show } from 'solid-js';
import type { IconName } from '../../../icon/types';
import { Icon } from '../../../icon/Icon';

export function ActionButton(props: {
  label: string;
  icon: IconName;
  controlId: string;
  reason?: string;
  pressed?: boolean;
  primary?: boolean;
  toggle?: boolean;
  onClick: () => void;
}) {
  const id = createUniqueId();
  return (
    <>
      <button
        type="button"
        class="browser-action"
        classList={{
          'browser-action-primary': props.primary,
          'browser-action-toggle': props.toggle,
        }}
        data-control-id={props.controlId}
        aria-label={props.label}
        title={props.reason ? `${props.label}: ${props.reason}` : props.label}
        aria-disabled={!!props.reason}
        aria-describedby={props.reason ? id : undefined}
        aria-pressed={props.pressed}
        onClick={() => {
          if (!props.reason) props.onClick();
        }}
      >
        <Icon
          name={props.icon}
          size={18}
          class={props.toggle && props.pressed ? 'browser-active-icon' : undefined}
        />
        <span class="browser-action-label">{props.label}</span>
      </button>
      <Show when={props.reason}>
        <span id={id} class="browser-sr-only">
          {props.reason}
        </span>
      </Show>
    </>
  );
}
