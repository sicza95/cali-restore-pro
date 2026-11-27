import { createEffect, createSignal, createUniqueId, For } from 'solid-js';
import { Icon } from '../../icon/Icon';
import type { IconName } from '../../icon/types';
import { followSelectRow } from './position';
import './styles.css';

/** A setting opens its choices directly; native popovers escape clipping and light-dismiss. */
export function SettingsSelectRow<T extends string>(props: {
  id: string;
  title: string;
  help: string;
  icon: IconName;
  value: T;
  options: readonly T[];
  text: (value: T) => string;
  control: string;
  optionControl: (value: T) => string;
  pick: (value: T) => void;
}) {
  const uid = createUniqueId();
  const [open, setOpen] = createSignal(false);
  let trigger!: HTMLButtonElement;
  let panel!: HTMLDivElement;
  let search = '';
  let searchedAt = 0;
  const items = () => Array.from(panel.querySelectorAll<HTMLButtonElement>('[role="option"]'));
  const focus = (at: number) => {
    const options = items();
    const next = options[(at + options.length) % options.length];
    next?.focus({ preventScroll: true });
    next?.scrollIntoView({ block: 'nearest' });
  };
  const close = () => {
    panel.hidePopover();
    setOpen(false);
  };
  const show = (last = false) => {
    panel.showPopover({ source: trigger });
    setOpen(true);
    search = '';
    focus(last ? props.options.length - 1 : Math.max(0, props.options.indexOf(props.value)));
  };
  createEffect(() => {
    if (open())
      followSelectRow(
        () => trigger,
        () => panel,
      );
  });
  const keys = (event: KeyboardEvent) => {
    const at = items().indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'Tab') {
      trigger.focus({ preventScroll: true });
      close();
      return;
    }
    if (event.key === 'Escape') {
      close();
      trigger.focus({ preventScroll: true });
    } else if (event.key === 'ArrowDown') focus(at + 1);
    else if (event.key === 'ArrowUp') focus(at - 1);
    else if (event.key === 'Home') focus(0);
    else if (event.key === 'End') focus(props.options.length - 1);
    else if (event.key.length === 1 && event.key !== ' ' && !event.ctrlKey && !event.metaKey) {
      search = (Date.now() - searchedAt < 700 ? search : '') + event.key.toLocaleLowerCase();
      searchedAt = Date.now();
      const next = props.options.findIndex((value) =>
        props.text(value).toLocaleLowerCase().startsWith(search),
      );
      if (next >= 0) focus(next);
    } else return;
    event.preventDefault();
  };
  return (
    <div id={props.id} class="settings-option settings-select-row">
      <button
        ref={(element) => (trigger = element)}
        type="button"
        class="settings-select-trigger"
        data-control-id={props.control}
        aria-haspopup="listbox"
        aria-expanded={open()}
        aria-controls={`${uid}-options`}
        popovertarget={`${uid}-options`}
        onClick={(event) => {
          event.preventDefault();
          if (open()) close();
          else show();
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            show(event.key === 'ArrowUp');
          }
        }}
      >
        <span class="settings-option-icon" aria-hidden="true">
          <Icon name={props.icon} size={20} />
        </span>
        <span class="settings-option-text">
          <strong id={`${uid}-title`}>{props.title}</strong>
          <span id={`${uid}-help`}>{props.help}</span>
        </span>
        <span class="settings-option-value">{props.text(props.value)}</span>
        <Icon name="chevron" size={16} class="settings-option-chevron" />
      </button>
      <div
        ref={(element) => (panel = element)}
        id={`${uid}-options`}
        class="settings-select-options"
        popover="auto"
        role="listbox"
        aria-label={props.title}
        onBeforeToggle={(event) => {
          if (event.newState === 'closed') setOpen(false);
        }}
        onKeyDown={keys}
      >
        <For each={props.options}>
          {(value) => (
            <button
              type="button"
              role="option"
              tabindex="-1"
              aria-selected={props.value === value}
              data-control-id={props.optionControl(value)}
              onClick={() => {
                props.pick(value);
                close();
                trigger.focus({ preventScroll: true });
              }}
            >
              <span>{props.text(value)}</span>
              <span
                class="settings-select-check"
                aria-hidden="true"
                data-selected={props.value === value}
              >
                <Icon name="check" size={18} />
              </span>
            </button>
          )}
        </For>
      </div>
    </div>
  );
}
