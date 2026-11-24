import { Show, type JSX } from 'solid-js';
import { Icon } from '../icon/Icon';
import type { IconName } from '../icon/types';

/** One section of the Settings page: a title, a short description and its accordion items. */
export function SettingsSection(props: {
  id: string;
  title: string;
  help: string;
  children: JSX.Element;
}) {
  return (
    <section class="settings-section" id={props.id} aria-labelledby={`${props.id}-heading`}>
      <header>
        <h2 id={`${props.id}-heading`}>{props.title}</h2>
        <p>{props.help}</p>
      </header>
      <div class="settings-options">{props.children}</div>
    </section>
  );
}

/**
 * One setting: a row that opens in place. Rows of a section share `group`, so opening one closes
 * the others. `value` shows the current choice at the end of a closed row.
 */
export function SettingsItem(props: {
  id: string;
  group: string;
  title: string;
  help?: string;
  value?: string;
  icon?: IconName;
  control?: string;
  children: JSX.Element;
}) {
  return (
    <details class="settings-option" name={props.group} id={props.id}>
      <summary data-control-id={props.control ?? `settings.item.${props.id}`}>
        <Show when={props.icon}>
          {(icon) => (
            <span class="settings-option-icon" aria-hidden="true">
              <Icon name={icon()} size={20} />
            </span>
          )}
        </Show>
        <span class="settings-option-text">
          <strong>{props.title}</strong>
          <Show when={props.help}>
            <span>{props.help}</span>
          </Show>
        </span>
        <Show when={props.value}>
          <span class="settings-option-value">{props.value}</span>
        </Show>
        <Icon name="chevron" size={16} class="settings-option-chevron" />
      </summary>
      <div class="settings-option-body" data-icon={props.icon ? '' : undefined}>
        {props.children}
      </div>
    </details>
  );
}
