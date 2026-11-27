import { createUniqueId, Show } from 'solid-js';
import { Icon } from '../../icon/Icon';
import type { IconName } from '../../icon/types';
import '../../controls/switch/styles.css';
import './styles.css';

/** A boolean preference is editable directly, without opening an accordion. */
export function SettingsToggleRow(props: {
  id: string;
  title: string;
  help?: string;
  icon: IconName;
  control: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const helpId = createUniqueId();
  return (
    <label id={props.id} class="settings-option settings-toggle-row cr-switch-row">
      <span class="settings-option-icon" aria-hidden="true">
        <Icon name={props.icon} size={20} />
      </span>
      <span class="settings-option-text">
        <strong>{props.title}</strong>
        <Show when={props.help}>
          <span id={helpId}>{props.help}</span>
        </Show>
      </span>
      <input
        type="checkbox"
        role="switch"
        aria-label={props.title}
        aria-describedby={props.help ? helpId : undefined}
        checked={props.checked}
        data-control-id={props.control}
        onChange={(event) => props.onChange(event.currentTarget.checked)}
      />
      <span class="cr-switch-track" aria-hidden="true" />
    </label>
  );
}
