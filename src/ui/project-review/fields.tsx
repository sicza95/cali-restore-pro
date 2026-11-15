import { createUniqueId, For, Show } from 'solid-js';
import type { JSX } from 'solid-js';

export function ReviewSelect<T extends string>(props: {
  id: string;
  label: string;
  value: T;
  options: readonly T[];
  text?: (key: T) => string;
  change: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <label>
      {props.label}
      <select
        data-control-id={props.id}
        disabled={props.disabled}
        onChange={(e) => props.change(e.currentTarget.value as T)}
      >
        <For each={props.options}>
          {(option) => (
            <option value={option} selected={props.value === option}>
              {props.text?.(option) ?? option}
            </option>
          )}
        </For>
      </select>
    </label>
  );
}

export function ReviewCheck(props: {
  id: string;
  checked: boolean;
  change: (value: boolean) => void;
  disabled?: boolean;
  children: JSX.Element;
}) {
  return (
    <label class="review-check">
      <input
        type="checkbox"
        data-control-id={props.id}
        checked={props.checked}
        disabled={props.disabled}
        onChange={(e) => props.change(e.currentTarget.checked)}
      />
      {props.children}
    </label>
  );
}

export function validDecimal(text: string, min = 0, max = 1_000_000_000, required = true) {
  const value = text.trim();
  if (!value) return !required;
  if (!/^[+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+)$/.test(value)) return false;
  const number = Number(value.replace(',', '.'));
  return Number.isFinite(number) && number >= min && number <= max;
}

export function ReviewNumber(props: {
  id: string;
  label: string;
  value: string;
  change: (value: string) => void;
  error: string;
  min?: number;
  max?: number;
  optional?: boolean;
  readOnly?: boolean;
}) {
  const description = createUniqueId();
  const invalid = () =>
    !props.readOnly && !validDecimal(props.value, props.min, props.max, !props.optional);
  return (
    <label>
      {props.label}
      <input
        type="text"
        inputmode="decimal"
        maxlength="32"
        data-control-id={props.id}
        value={props.value}
        readOnly={props.readOnly}
        aria-invalid={invalid() || undefined}
        aria-describedby={invalid() ? description : undefined}
        onInput={(e) => props.change(e.currentTarget.value)}
      />
      <Show when={invalid()}>
        <small id={description}>{props.error}</small>
      </Show>
    </label>
  );
}
