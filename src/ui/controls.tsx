import { For, Show, createUniqueId, splitProps } from 'solid-js';
import type { JSX } from 'solid-js';
import { Icon } from './Icon';
import type { IconName } from './Icon';

export interface ButtonProps extends JSX.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  icon?: IconName;
}

export function Button(props: ButtonProps) {
  const [local, rest] = splitProps(props, ['variant', 'icon', 'children', 'class']);
  return (
    <button
      type="button"
      {...rest}
      class={`cr-button cr-button--${local.variant ?? 'secondary'} ${local.class ?? ''}`}
    >
      <Show when={local.icon}>{(name) => <Icon name={name()} />}</Show>
      {local.children}
    </button>
  );
}

export function IconButton(
  props: Omit<ButtonProps, 'icon' | 'children'> & {
    icon: IconName;
    label: string;
  },
) {
  const [local, rest] = splitProps(props, ['label', 'icon', 'class']);
  return (
    <Button
      {...rest}
      class={`cr-icon-button ${local.class ?? ''}`}
      aria-label={local.label}
      title={local.label}
    >
      <Icon name={local.icon} />
    </Button>
  );
}

export const tools = [
  { id: 'select', label: 'Select', shortcut: 'V', icon: 'select' },
  { id: 'brush', label: 'Brush', shortcut: 'B', icon: 'brush' },
  { id: 'eraser', label: 'Eraser', shortcut: 'E', icon: 'eraser' },
  { id: 'pen', label: 'Pen', shortcut: 'P', icon: 'pen' },
  { id: 'nodes', label: 'Edit points', shortcut: 'A', icon: 'nodes' },
  { id: 'frame', label: 'Crop', shortcut: 'C', icon: 'frame' },
  { id: 'hand', label: 'Pan', shortcut: 'H', icon: 'hand' },
] as const;

export type Tool = (typeof tools)[number]['id'];

/** Shared roving-focus behavior for toolbars and tablists; selection remains explicit. */
export function moveFocus(event: KeyboardEvent, container: HTMLElement, selector: string) {
  if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
    return;
  }
  const controls = Array.from(container.querySelectorAll<HTMLButtonElement>(selector)).filter(
    (control) => !control.disabled,
  );
  if (!controls.length) return;
  event.preventDefault();
  const current = controls.findIndex((control) => control === document.activeElement);
  const next =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? controls.length - 1
        : (current + (['ArrowDown', 'ArrowRight'].includes(event.key) ? 1 : -1) + controls.length) %
          controls.length;
  controls[next]?.focus();
}

export function ToolRail(props: { active: Tool; onChange: (tool: Tool) => void }) {
  return (
    <div
      class="cr-tool-rail cr-glass"
      role="toolbar"
      aria-label="Drawing tools"
      aria-orientation="vertical"
      onKeyDown={(event) => moveFocus(event, event.currentTarget, 'button')}
    >
      <For each={tools}>
        {(tool) => (
          <button
            class="cr-tool"
            type="button"
            aria-label={tool.label}
            aria-pressed={props.active === tool.id}
            aria-keyshortcuts={tool.shortcut}
            title={`${tool.label} (${tool.shortcut})`}
            tabIndex={props.active === tool.id ? 0 : -1}
            onClick={() => props.onChange(tool.id)}
          >
            <Icon name={tool.icon} size={22} />
          </button>
        )}
      </For>
    </div>
  );
}

export type SaveState = 'saved' | 'saving' | 'offline' | 'draft' | 'error';
const saveStates: Record<SaveState, { label: string; compact: string; icon: IconName }> = {
  saved: { label: 'Saved on this iPad', compact: 'Saved', icon: 'check' },
  saving: { label: 'Saving on this iPad…', compact: 'Saving…', icon: 'more' },
  offline: { label: 'Offline · saved on this iPad', compact: 'Offline · saved', icon: 'offline' },
  draft: { label: 'Draft saved on this iPad', compact: 'Draft saved', icon: 'check' },
  error: { label: 'Could not save · last saved 14:27', compact: 'Could not save', icon: 'alert' },
};

export function SaveStatus(props: { state: SaveState; onRetry?: () => void }) {
  return (
    <div class="cr-save" data-state={props.state} role="status" aria-atomic="true">
      <Icon name={saveStates[props.state].icon} size={16} />
      <span class="cr-save-long">{saveStates[props.state].label}</span>
      <span class="cr-save-short">{saveStates[props.state].compact}</span>
      <Show when={props.state === 'error' && props.onRetry}>
        <Button variant="ghost" onClick={() => props.onRetry?.()}>
          Retry
        </Button>
      </Show>
    </div>
  );
}

export function RangeControl(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  unit: string;
  onChange: (value: number) => void;
}) {
  const id = createUniqueId();
  return (
    <div class="cr-range">
      <label for={id}>{props.label}</label>
      <input
        id={id}
        type="range"
        min={props.min}
        max={props.max}
        value={props.value}
        aria-valuetext={`${props.value} ${props.unit}`}
        onInput={(event) => props.onChange(event.currentTarget.valueAsNumber)}
      />
      <output for={id}>
        {props.value}
        <span> {props.unit}</span>
      </output>
    </div>
  );
}

export function Switch(props: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
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

export function Field(props: {
  label: string;
  value: string;
  onInput: (value: string) => void;
  error?: string;
  hint?: string;
  suffix?: string;
  inputMode?: JSX.InputHTMLAttributes<HTMLInputElement>['inputMode'];
}) {
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
